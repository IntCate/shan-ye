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
 */

import { Image } from 'expo-image';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Callout, Marker, Polyline } from 'react-native-maps';

import { BubbleTail } from '@/components/bubble-tail';
import { HeadingCone } from '@/components/heading-cone';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { GeoPoint, SatelliteMapHandle, SatelliteMapProps } from '@/types/map';

/** animateToRegion 默认动画时长（ms）。 */
const DEFAULT_ANIMATE_DURATION = 600;

/** 照片 Marker 图片尺寸（含 2px 白边）。 */
const PHOTO_MARKER_SIZE = 60;
/** 照片 Marker 尾巴高度（px）。 */
const PHOTO_MARKER_TAIL_HEIGHT = 8;
/** 照片 Marker 整体高度 = 图片 + 尾巴，用于计算 iOS Apple Maps 的 centerOffset。 */
const PHOTO_MARKER_TOTAL_HEIGHT = PHOTO_MARKER_SIZE + PHOTO_MARKER_TAIL_HEIGHT;

export const SatelliteMap = forwardRef<SatelliteMapHandle, SatelliteMapProps>(function SatelliteMap(
  { initialRegion, mapType = 'hybrid', markers = [], photoMarkers = [], routes = [], heading, onPhotoPress, showsUserLocation, onRegionChangeComplete, onRegionChange, onUserLocationChange, onPress, onLongPress },
  ref
) {
  const mapRef = useRef<MapView>(null);
  const lastMarkerRef = useRef<InstanceType<typeof Marker> | null>(null);
  // 蓝点最新坐标（state）：用于驱动 heading cone Marker 的坐标。
  // 与外层 onUserLocationChange 回调同源，但需为 state 才能触发 cone Marker 重渲染。
  // 系统蓝点由 showsUserLocation 渲染，cone Marker 锚定同坐标叠加其上，同帧更新无偏移。
  const [userCoord, setUserCoord] = useState<GeoPoint | null>(null);

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

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      mapType={nativeMapType}
      showsUserLocation={showsUserLocation}
      showsCompass={false}
      paddingAdjustmentBehavior="always"
      onPress={() => {
        onPress?.();
      }}
      onLongPress={(e) => {
        const c = e.nativeEvent.coordinate;
        const p = e.nativeEvent.position;
        if (c) {
          onLongPress?.({
            coordinate: { latitude: c.latitude, longitude: c.longitude },
            position: p ? { x: p.x, y: p.y } : { x: 0, y: 0 },
          });
        }
      }}
      onUserLocationChange={(e) => {
        const c = e.nativeEvent.coordinate;
        if (c) {
          const point: GeoPoint = { latitude: c.latitude, longitude: c.longitude };
          setUserCoord(point); // 驱动 heading cone Marker 坐标
          onUserLocationChange?.({ latitude: c.latitude, longitude: c.longitude });
        }
      }}
      onRegionChange={onRegionChange}
      onRegionChangeComplete={onRegionChangeComplete}>
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

      {/* 照片地理标记：图片 + 尾巴组成的图钉，尾巴尖端指向 GPS 坐标。
          - Android（Google Maps）：anchor {0.5,1} 把视图底边中心（尾巴尖）锚定到坐标；
          - iOS（Apple Maps）：anchor 不生效，用 centerOffset 把视图上移半个总高度，使尾巴尖落到坐标。
          两 prop 各自平台生效、互不影响，故同时传入。点击图片触发 onPhotoPress 弹出底部详情面板。 */}
      {photoMarkers.map((p) => (
        <Marker
          key={`photo-${p.id}`}
          coordinate={p}
          anchor={{ x: 0.5, y: 1 }}
          centerOffset={{ x: 0, y: -PHOTO_MARKER_TOTAL_HEIGHT / 2 }}
          onPress={() => onPhotoPress?.(p)}>
          <View style={styles.photoMarkerWrap}>
            <Image source={{ uri: p.uri }} style={styles.photoMarkerImg} contentFit="cover" />
            <BubbleTail direction="down" color="#ffffff" size={PHOTO_MARKER_TAIL_HEIGHT} />
          </View>
        </Marker>
      ))}

      {/* 导入的路径文件：按 visible 过滤后渲染 Polyline。
          一条路线可含多段（KML MultiGeometry / GPX 多 trkseg），每段一条 Polyline。
          strokeWidth=4 + 圆角端点，在卫星图上清晰可见且转角圆滑。 */}
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

      {/* 朝向锥形指示器（heading cone）：叠加在系统定位蓝点上，半透明蓝色光束指示设备朝向。
          仅当 heading（磁力计可用）与 userCoord（蓝点已更新）均就绪时渲染。
          形如 iOS Maps 的方向指示；React.memo 隔离，heading ~10Hz 更新仅重渲染本 Marker。 */}
      {heading != null && userCoord != null && (
        <HeadingCone coordinate={userCoord} heading={heading} />
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
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
