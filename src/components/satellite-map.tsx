"use no memo";

/**
 * 卫星地图组件（原生端）。
 *
 * 基于 react-native-maps，iOS 默认使用 Apple Maps（免费、无需 API key），
 * mapType="hybrid" 显示卫星图叠加道路标注。
 *
 * 通过 forwardRef + useImperativeHandle 暴露 animateToRegion，
 * 业务侧通过 ref 命令式驱动地图跳转，无需直接接触 MapView ref。
 *
 * 交互约束：
 * - 单击空白：onPress（用于取消/移除 Marker，不带坐标，避免 native tap deselect 竞态）
 * - 长按空白：onLongPress（用于落 Marker/弹 Callout，长按时 native 不会 deselect annotation，
 *   从根上消除"showCallout 弹出后立即关闭"的 iOS Apple Maps 竞态问题）
 *
 * 性能设计（本文件使用 "use no memo"，React Compiler 会引发地图渲染问题，见项目记录）：
 * - 高频更新源（磁力计 heading ~10Hz、蓝点 userCoord ~1Hz）均在本组件内部订阅/持有，
 *   不再经 HomeScreen 传导整树。
 * - 所有 Marker/Polyline 提取为 React.memo 子组件（SearchMarkers / PhotoMarkers / RoutePolylines），
 *   高频更新只重渲染 HeadingCone（自身已 memo），其余地图子元素 props 未变则不重渲染。
 * - 恒定对象（anchor / centerOffset）提升为模块级常量，避免每次渲染新建触发 native 下发。
 */

import { Image } from 'expo-image';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, Polyline } from 'react-native-maps';
import type { LongPressEvent, UserLocationChangeEvent } from 'react-native-maps';

import { BubbleTail } from '@/components/bubble-tail';
import { HeadingCone } from '@/components/heading-cone';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Shadow } from '@/constants/theme';
import { useHeading } from '@/hooks/use-heading';
import { clusterPhotos, type PhotoClusterItem } from '@/utils/cluster';
import type { GeoTaggedPhoto, PhotoCluster } from '@/types/geotagged-photo';
import type { GeoPoint, MapMarker, MapRegion, SatelliteMapHandle, SatelliteMapProps } from '@/types/map';
import type { Route } from '@/types/route';

/** animateToRegion 默认动画时长（ms）。 */
const DEFAULT_ANIMATE_DURATION = 600;

/** 照片 Marker 图片尺寸（含 2px 白边）。 */
const PHOTO_MARKER_SIZE = 60;
/** 照片 Marker 尾巴高度（px）。 */
const PHOTO_MARKER_TAIL_HEIGHT = 8;
/** 照片 Marker 整体高度 = 图片 + 尾巴，用于计算 iOS Apple Maps 的 centerOffset。 */
const PHOTO_MARKER_TOTAL_HEIGHT = PHOTO_MARKER_SIZE + PHOTO_MARKER_TAIL_HEIGHT;
/** 照片 Marker 锚点（Android：底边中心=尾巴尖）。恒定对象提升为模块常量。 */
const PHOTO_MARKER_ANCHOR = { x: 0.5, y: 1 } as const;
/** 照片 Marker 中心偏移（iOS：上移半个总高度使尾巴尖落坐标）。 */
const PHOTO_MARKER_CENTER_OFFSET = { x: 0, y: -PHOTO_MARKER_TOTAL_HEIGHT / 2 } as const;
/** 照片簇数量徽标直径（px），叠在缩略图右下角。 */
const CLUSTER_BADGE_SIZE = 22;

/** 搜索 Marker 组：点击地图空白或长按后展示的搜索结果大头针（末个默认弹 Callout）。
 *  React.memo 隔离：仅 markers 引用或 lastMarkerRef 变化才重渲染。 */
const SearchMarkers = memo(function SearchMarkers({
  markers,
  lastMarkerRef,
}: {
  markers: MapMarker[];
  lastMarkerRef: React.RefObject<InstanceType<typeof Marker> | null>;
}) {
  return (
    <>
      {markers.map((m, i) => (
        <Marker
          key={`${m.latitude},${m.longitude},${i}`}
          ref={i === markers.length - 1 ? (r) => { lastMarkerRef.current = r; } : undefined}
          coordinate={m}>
          <Callout>
            <ThemedView type="backgroundElement" style={styles.callout}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {m.title}
              </ThemedText>
              {m.subtitle && (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  {m.subtitle}
                </ThemedText>
              )}
            </ThemedView>
          </Callout>
        </Marker>
      ))}
    </>
  );
});

/** 照片地理标记组：图片 + 尾巴组成的图钉，尾巴尖指向 GPS 坐标。
 *  单张照片与聚合簇共用同款 Marker 样式（缩略图 + 白边 + 尾巴），簇叠加数量徽标。
 *  React.memo 隔离：仅 photoMarkers 引用或 onPhotoPress/onClusterPress 变化才重渲染。
 *
 *  图片源用 asset.id（iOS 为 ph:// localIdentifier）：expo-image 原生按容器尺寸请求系统
 *  缩略图（PhotoLibraryAssetLoader），数据管线无需提前 getUri（原图路径 + iCloud 下载）。
 *  簇用第一张照片的缩略图作为代表图。
 *
 *  Android tracksViewChanges：Marker 默认 true 会持续追踪自定义视图变化，量大时卡顿。
 *  图片加载完成前保持追踪（灰底占位 → 图片渲染），onLoad 后置 false 做最终快照停止追踪。
 *  iOS Apple Maps 忽略该 prop，视图为活视图。 */
const PhotoMarkers = memo(function PhotoMarkers({
  photoMarkers,
  onPhotoPress,
  onClusterPress,
}: {
  photoMarkers: PhotoClusterItem[];
  onPhotoPress?: (photo: GeoTaggedPhoto) => void;
  onClusterPress?: (cluster: PhotoCluster) => void;
}) {
  const [loadedIds, setLoadedIds] = useState<Set<string>>(() => new Set());
  const markLoaded = useCallback((id: string) => {
    setLoadedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  return (
    <>
      {photoMarkers.map((item) => {
        if ('count' in item) {
          // 照片簇：用第一张照片缩略图 + 数量徽标，点击放大展开
          const thumbId = item.photos[0]?.id;
          return (
            <Marker
              key={item.id}
              coordinate={item}
              anchor={PHOTO_MARKER_ANCHOR}
              centerOffset={PHOTO_MARKER_CENTER_OFFSET}
              tracksViewChanges={thumbId ? !loadedIds.has(thumbId) : false}
              onPress={() => onClusterPress?.(item)}>
              <View style={styles.photoMarkerWrap}>
                <View>
                  {thumbId && (
                    <Image
                      source={{ uri: thumbId }}
                      style={styles.photoMarkerImg}
                      contentFit="cover"
                      onLoad={() => markLoaded(thumbId)}
                      onError={() => markLoaded(thumbId)}
                    />
                  )}
                  {/* 数量徽标：叠在缩略图右下角 */}
                  <View style={styles.clusterBadge}>
                    <Text style={styles.clusterCount}>
                      {item.count > 99 ? '99+' : item.count}
                    </Text>
                  </View>
                </View>
                <BubbleTail direction="down" color="#ffffff" size={PHOTO_MARKER_TAIL_HEIGHT} />
              </View>
            </Marker>
          );
        }
        return (
          <Marker
            key={`photo-${item.id}`}
            coordinate={item}
            anchor={PHOTO_MARKER_ANCHOR}
            centerOffset={PHOTO_MARKER_CENTER_OFFSET}
            tracksViewChanges={!loadedIds.has(item.id)}
            onPress={() => onPhotoPress?.(item)}>
            <View style={styles.photoMarkerWrap}>
              <Image
                source={{ uri: item.id }}
                style={styles.photoMarkerImg}
                contentFit="cover"
                onLoad={() => markLoaded(item.id)}
                onError={() => markLoaded(item.id)}
              />
              <BubbleTail direction="down" color="#ffffff" size={PHOTO_MARKER_TAIL_HEIGHT} />
            </View>
          </Marker>
        );
      })}
    </>
  );
});

/** 导入的路径 Polyline 组：按 visible 过滤后渲染。一条路线可含多段（KML MultiGeometry /
 *  GPX 多 trkseg），每段一条 Polyline。strokeWidth=4 + 圆角端点在卫星图上清晰可见。
 *  React.memo 隔离：仅 routes 引用变化才重渲染。 */
const RoutePolylines = memo(function RoutePolylines({ routes }: { routes: Route[] }) {
  return (
    <>
      {routes
        .filter((r) => r.visible)
        .flatMap((r) =>
          r.segments.map((seg, i) => (
            <Polyline
              key={`route-${r.id}-${i}`}
              coordinates={seg.points}
              strokeColor={r.color}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
          ))
        )}
    </>
  );
});

export const SatelliteMap = forwardRef<SatelliteMapHandle, SatelliteMapProps>(function SatelliteMap(
  {
    initialRegion,
    mapType = 'hybrid',
    markers = [],
    photoMarkers = [],
    routes = [],
    onPhotoPress,
    onClusterPress,
    showsUserLocation,
    onRegionChangeComplete,
    onRegionChange,
    onUserLocationChange,
    onPress,
    onLongPress,
  },
  ref
) {
  const mapRef = useRef<MapView>(null);
  const lastMarkerRef = useRef<InstanceType<typeof Marker> | null>(null);
  // 设备朝向（磁力计 ~10Hz）：在组件内部订阅，高频更新经 React.memo 隔离后
  // 只重渲染 HeadingCone，不再波及 HomeScreen 整树。
  const heading = useHeading();
  // 蓝点最新坐标（state）：用于驱动 heading cone Marker 的坐标。
  // 与外层 onUserLocationChange 回调同源，但需为 state 才能触发 cone Marker 重渲染。
  // 系统蓝点由 showsUserLocation 渲染，cone Marker 锚定同坐标叠加其上，同帧更新无偏移。
  const [userCoord, setUserCoord] = useState<GeoPoint | null>(null);
  // 当前视口（onRegionChangeComplete 的最新值）：驱动照片标记聚类与视口裁剪。
  // 仅在手势结束时更新（非每帧），重算成本 O(n)（n ≤ MAX_PHOTOS）毫秒级，可接受。
  const [viewport, setViewport] = useState<MapRegion>(initialRegion);

  // 照片标记聚类：把视口内（含缓冲）的照片聚合为「单张 / 簇」，并裁剪视口外数据。
  const clustered = useMemo(() => clusterPhotos(photoMarkers, viewport), [photoMarkers, viewport]);

  // 暴露 animateToRegion 给业务侧：业务侧 mapRef.current.animateToRegion 直接生效，
  // 无需直接访问 MapView ref（避免跨层耦合）。缺失此调用会导致 ref.current 恒为 undefined，
  // 所有 moveMap（定位/搜索/路线选择）都会静默失败。
  useImperativeHandle(ref, () => ({
    animateToRegion: (region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }, durationMs = DEFAULT_ANIMATE_DURATION) => {
      mapRef.current?.animateToRegion(region, durationMs);
    },
  }));

  // 新 Marker mount 后下一帧弹 Callout：长按时 native 不会 deselect annotation，
  // 无 showCallout 竞态，直接 rAF 即可，不需要 setTimeout 延迟或 onDeselect 兜底。
  useEffect(() => {
    if (markers.length === 0) return;
    const id = requestAnimationFrame(() => {
      lastMarkerRef.current?.showCallout();
    });
    return () => cancelAnimationFrame(id);
  }, [markers]);

  // 'weather' 是业务侧自定义类型，react-native-maps 不支持；映射到 'standard'，
  // 后续可在地图上叠加天气图层（如降水/云图 TileOverlay）。
  const nativeMapType = mapType === 'weather' ? 'standard' : mapType;

  // 以下回调 useCallback 稳定化：避免每次渲染新建（本文件 "use no memo"，
  // 无 React Compiler 兜底），也避免 MapView prop 反复变化触发 native 重配。
  const handlePress = useCallback(() => {
    onPress?.();
  }, [onPress]);

  const handleLongPress = useCallback((e: LongPressEvent) => {
    const c = e.nativeEvent.coordinate;
    const p = e.nativeEvent.position;
    if (c) {
      onLongPress?.({
        coordinate: { latitude: c.latitude, longitude: c.longitude },
        position: p ? { x: p.x, y: p.y } : { x: 0, y: 0 },
      });
    }
  }, [onLongPress]);

  const handleUserLocationChange = useCallback((e: UserLocationChangeEvent) => {
    const c = e.nativeEvent.coordinate;
    if (c) {
      const point: GeoPoint = { latitude: c.latitude, longitude: c.longitude };
      setUserCoord(point); // 驱动 heading cone Marker 坐标
      onUserLocationChange?.({ latitude: c.latitude, longitude: c.longitude });
    }
  }, [onUserLocationChange]);

  // 手势结束后：更新内部视口（重聚类/视口裁剪）并透传外层回调
  const handleRegionChangeComplete = useCallback(
    (region: MapRegion) => {
      setViewport(region);
      onRegionChangeComplete?.(region);
    },
    [onRegionChangeComplete]
  );

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      mapType={nativeMapType}
      showsUserLocation={showsUserLocation}
      showsCompass={false}
      paddingAdjustmentBehavior="always"
      onPress={handlePress}
      onLongPress={handleLongPress}
      onUserLocationChange={handleUserLocationChange}
      onRegionChange={onRegionChange}
      onRegionChangeComplete={handleRegionChangeComplete}>
      <SearchMarkers markers={markers} lastMarkerRef={lastMarkerRef} />

      <PhotoMarkers
        photoMarkers={clustered}
        onPhotoPress={onPhotoPress}
        onClusterPress={onClusterPress}
      />

      <RoutePolylines routes={routes} />

      {/* 朝向锥形指示器（heading cone）：叠加在系统定位蓝点上，半透明蓝色光束指示设备朝向。
          仅当 heading（磁力计可用）与 userCoord（蓝点已更新）均就绪时渲染。
          HeadingCone 自身 React.memo 隔离：heading ~10Hz 更新仅重渲染本 Marker。 */}
      {heading.heading != null && userCoord != null && (
        <HeadingCone coordinate={userCoord} heading={heading.heading} />
      )}
    </MapView>
  );
});

const styles = StyleSheet.create({
  callout: {
    padding: 8,
    borderRadius: 8,
    gap: 2,
    maxWidth: 240,
  },
  /** 照片 Marker 容器：图片在上、尾巴在下，水平居中对齐。 */
  photoMarkerWrap: {
    alignItems: 'center',
  },
  /** 照片 Marker 图片：圆角方图 + 白色描边 + 轻阴影。尺寸须与 PHOTO_MARKER_SIZE 一致，
   *  以保证 iOS centerOffset 的偏移量计算正确（尾巴尖落点）。 */
  photoMarkerImg: {
    width: PHOTO_MARKER_SIZE,
    height: PHOTO_MARKER_SIZE,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: '#cccccc',
    ...Shadow.sm,
  },
  /** 照片簇数量徽标：圆形徽章叠在缩略图右下角，系统蓝高对比。 */
  clusterBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    minWidth: CLUSTER_BADGE_SIZE,
    height: CLUSTER_BADGE_SIZE,
    borderRadius: CLUSTER_BADGE_SIZE / 2,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(0, 122, 255, 0.92)',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  clusterCount: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
