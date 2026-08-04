/**
 * 首页：卫星地图视图。
 *
 * 打开 app 时自动定位到用户当前位置：
 * - 定位中：显示 loading 覆盖层，不渲染地图（避免默认坐标闪现）
 * - 定位成功：地图首次渲染即为当前位置（无跳转动画）
 * - 定位失败：回退到默认坐标（INITIAL_REGION）
 *
 * 地图交互：
 * - 长按空白：显示红点 + 悬浮坐标卡片（含名称输入与「添加/收藏」按钮），确认后加入收藏标点
 * - 单击空白：清空 Marker 与浮动卡片
 * - 搜索框：输入地址跳转并落 Marker
 * - 定位按钮：跳回当前位置
 * - 绘制按钮：打开轨迹录制面板（开始/暂停/继续/结束，统计里程/耗时/海拔）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Asset, requestPermissionsAsync as requestMediaLibraryPermissionsAsync } from 'expo-media-library';

import { AltitudeSheet } from '@/components/altitude-sheet';
import { MapFloatingButton } from '@/components/map-floating-button';
import { MapLayerMenu, type LayerKey } from '@/components/map-layer-menu';
import { MapSavePlacemarkCard } from '@/components/map-save-placemark-card';
import { MapSearchBar, type MapSearchBarHandle } from '@/components/map-search-bar';
import { PhotoDetailSheet } from '@/components/photo-detail-sheet';
import { ProfileSheet } from '@/components/profile-sheet';
import { SatelliteMap } from '@/components/satellite-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TrackRecordPanel } from '@/components/track-record-panel';
import { INITIAL_REGION } from '@/constants/map';
import { Spacing } from '@/constants/theme';
import { useGeotaggedPhotos } from '@/hooks/use-geotagged-photos';
import { useLocation } from '@/hooks/use-location';
import { useMediaCount } from '@/hooks/use-media-count';
import { useAuth } from '@/hooks/use-auth';
import { useRoutes } from '@/hooks/use-routes';
import { usePlacemarks } from '@/hooks/use-placemarks';
import { useTheme } from '@/hooks/use-theme';
import { useTrackRecorder } from '@/hooks/use-track-recorder';
import type { GeoTaggedPhoto, PhotoCluster } from '@/types/geotagged-photo';
import type {
  GeoPoint,
  MapLongPressEvent,
  MapMarker,
  MapRegion,
  MapType,
  SatelliteMapHandle,
  UserLocationUpdate,
} from '@/types/map';
import type { Placemark } from '@/types/placemark';
import type { Route } from '@/types/route';
import { wgs84ToGcj02, withConvertedCoords } from '@/utils/coord-transform';
import { getRouteRegion } from '@/utils/route-parser';

/** 定位成功后的缩放级别（约城市街区尺度）。 */
const LOCATE_DELTA = 0.02;

/** 底部搜索框高度 + 间距：悬浮按钮组的底部偏移量（置于搜索框上方，避免重叠）。 */
const BOTTOM_BAR_OFFSET = 72;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<SatelliteMapHandle>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  // null = 定位中；非 null = 定位完成（成功取当前位置，失败取默认坐标）
  const [resolvedRegion, setResolvedRegion] = useState<MapRegion | null>(null);
  const location = useLocation();
  const theme = useTheme();
  // 设备照片 EXIF 地理标记：在地图上以图片 Marker 形式展示，点击弹出底部详情面板
  const { photos } = useGeotaggedPhotos();
  // 设备相册照片+视频总数：供「我的」面板统计项「照片」显示
  const photoCount = useMediaCount();
  // 当前选中的照片（非 null 时弹出底部详情面板）
  const [selectedPhoto, setSelectedPhoto] = useState<GeoTaggedPhoto | null>(null);
  // 地图图层类型（标准 / 卫星 / 天气），由「我的」面板切换
  const [mapType, setMapType] = useState<MapType>('hybrid');
  // 图层显隐开关（多选）：控制地图上路径 / 照片 / 标点是否显示，由图层多选器切换
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    routes: true,
    photos: true,
    placemarks: true,
  });
  // 照片 EXIF GPS 为 WGS-84。Apple Maps 卫星图底图用 GCJ-02 但不做内部转换，
  // 需手动 WGS-84 → GCJ-02 对齐底图（中国境外 wgs84ToGcj02 自动跳过）。
  // 矢量图模式（standard 等）由 Apple Maps 内部处理 WGS-84 → GCJ-02，无需手动转换。
  // layers.photos=false 时返回空数组，隐藏地图上所有照片 Marker。
  const photoMarkers = useMemo(() => {
    if (!layers.photos) return [];
    const isSatellite =
      mapType === 'satellite' ||
      mapType === 'hybrid' ||
      mapType === 'satelliteFlyover' ||
      mapType === 'hybridFlyover';
    return isSatellite ? photos.map((p) => withConvertedCoords(p, wgs84ToGcj02)) : photos;
  }, [photos, mapType, layers.photos]);
  // 图层选择器浮层是否展开
  const [layerMenuVisible, setLayerMenuVisible] = useState(false);
  // 「图层」按钮在按钮组内的位置/尺寸，用于把选择器浮层定位到按钮左侧并垂直居中
  const [layerBtnLayout, setLayerBtnLayout] = useState<{
    y: number;
    width: number;
    height: number;
  } | null>(null);
  // 导入的路径文件（KML/GPX），会话级保留；在地图上以 Polyline 形式展示
  const {
    routes,
    loading: routeLoading,
    error: routeError,
    importRoute,
    addRecordedRoute,
    toggleRoute,
    cycleCoordMode,
    removeRoute,
    renameRoute,
    clearError,
  } = useRoutes();
  // 「我的」个人中心底部卡片是否展开
  const [profileVisible, setProfileVisible] = useState(false);
  // 登录态：本地模拟认证（AsyncStorage 持久化），「我的」面板头像/昵称展示。
  // 登录面板由 ProfileSheet 内部嵌套渲染（二级面板），登录/退出均经此回调。
  const { user, login, logout } = useAuth();
  // 收藏标点（长按地图保存的坐标点），会话级内存存储
  const { placemarks, addPlacemark, removePlacemark } = usePlacemarks();
  // 路径绘制（轨迹录制）：状态机 + GPS 采集由 hook 持有；面板显隐由本页控制（关闭不停止录制）
  const tracker = useTrackRecorder();
  const [trackPanelVisible, setTrackPanelVisible] = useState(false);
  // 海拔高度面板：右侧「海拔高度测速」按钮打开，打开期间由面板内部 GPS 订阅实时刷新
  const [altitudeVisible, setAltitudeVisible] = useState(false);
  // 搜索会话激活（聚焦开始 → 选中结果/dismiss 结束）：会话期间隐藏右侧悬浮按钮组。
  // iOS 键盘避让把搜索框上移、结果列表上展都会进入按钮组区域（按钮固定定位不上移），
  // 绑定会话而非 blur（iOS 键盘收起触发 blur 但会话未结束），避免按钮恢复后遮住结果列表。
  const [searchActive, setSearchActive] = useState(false);
  // 长按地图待保存的标点：坐标 + 长按点像素坐标（null = 不显示）。
  // 悬浮坐标卡片与红点直接渲染在长按点上方（MapSavePlacemarkCard 内部实现）。
  const [savePlacemarkTarget, setSavePlacemarkTarget] = useState<{
    latitude: number;
    longitude: number;
    x: number;
    y: number;
  } | null>(null);

  // 打开 app 时自动定位；失败回退默认坐标
  useEffect(() => {
    let active = true;
    (async () => {
      const point = await location.requestAndLocate();
      if (!active) return;
      setResolvedRegion(
        point
          ? { ...point, latitudeDelta: LOCATE_DELTA, longitudeDelta: LOCATE_DELTA }
          : INITIAL_REGION
      );
    })();
    return () => {
      active = false;
    };
  }, [location.requestAndLocate]);

  /** 统一封装编程移动地图：先清保存卡片与图层浮层（像素坐标随地图移动失效），再 animate。
   *  新增地图操作（定位/搜索/其他按钮）只需调 moveMap，无需手动清卡片 / 关浮层。
   *  手势拖拽由 onRegionChange 兜底清除。 */
  const moveMap = useCallback((region: MapRegion, durationMs = 600) => {
    setSavePlacemarkTarget(null);
    setLayerMenuVisible(false);
    mapRef.current?.animateToRegion(region, durationMs);
  }, []);

  const handleSelectResult = useCallback(
    (point: GeoPoint, title: string) => {
      setMarkers([{ ...point, title }]); // 搜索结果：显示默认大头针图标
      moveMap({ ...point, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    },
    [moveMap]
  );

  // 长按地图空白：显示红点 + 悬浮坐标卡片（名称输入 + 添加/收藏按钮，MapSavePlacemarkCard 实现）。
  // 地图点击/移动/保存后关闭。
  const handleMapLongPress = useCallback((e: MapLongPressEvent) => {
    setMarkers([]); // 清搜索 Marker
    setSavePlacemarkTarget({
      latitude: e.coordinate.latitude,
      longitude: e.coordinate.longitude,
      x: e.position.x,
      y: e.position.y,
    });
  }, []);

  // 单击地图空白：清空 Marker、保存卡片与图层浮层，并收起搜索（失焦 + 隐藏结果列表）
  const handleMapPress = useCallback(() => {
    setMarkers([]);
    setSavePlacemarkTarget(null);
    setLayerMenuVisible(false);
    searchBarRef.current?.dismiss();
  }, []);

  // 手势拖拽/缩放时保存卡片像素坐标失效，需清除；图层浮层一并关闭。
  // 编程移动（定位/搜索）由 moveMap 统一清；此处仅兜底手势场景。
  const handleRegionChange = useCallback(() => {
    setSavePlacemarkTarget(null);
    setLayerMenuVisible(false);
  }, []);

  // 个人面板点击标点：定位到该标点（与点击路径定位行为一致，面板保持打开）
  const handleSelectPlacemark = useCallback(
    (placemark: Placemark) => {
      moveMap({
        latitude: placemark.latitude,
        longitude: placemark.longitude,
        latitudeDelta: LOCATE_DELTA,
        longitudeDelta: LOCATE_DELTA,
      });
    },
    [moveMap]
  );

  // 点击照片簇：放大到簇内照片包围盒（四周 20% 边距），簇随缩放逐步展开为单张照片 Marker。
  // 缩放级别由簇内照片的地理跨度决定；极端小跨度（近似同点）用最小 delta 兜底。
  const handlePhotoClusterPress = useCallback(
    (cluster: PhotoCluster) => {
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;
      for (const p of cluster.photos) {
        if (p.latitude < minLat) minLat = p.latitude;
        if (p.latitude > maxLat) maxLat = p.latitude;
        if (p.longitude < minLng) minLng = p.longitude;
        if (p.longitude > maxLng) maxLng = p.longitude;
      }
      moveMap({
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.005),
        longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.005),
      });
    },
    [moveMap]
  );

  // 蓝点由系统持续定位（精度通常高于单次快照）。缓存其最新坐标，供首帧对齐与定位按钮复用，
  // 确保地图中心与蓝点始终同源、不会因"快照 vs 系统定位"两源不一致而漂移。
  const alignedRef = useRef(false);
  const userLocationRef = useRef<UserLocationUpdate | null>(null);
  // 搜索框句柄：地图点击等外部操作时收起搜索（失焦 + 隐藏结果列表）
  const searchBarRef = useRef<MapSearchBarHandle>(null);

  const handleLocate = useCallback(async () => {
    // 优先用蓝点最新坐标（与蓝点同源，必然居中）
    if (userLocationRef.current) {
      moveMap({
        ...userLocationRef.current,
        latitudeDelta: LOCATE_DELTA,
        longitudeDelta: LOCATE_DELTA,
      });
      return;
    }
    // 蓝点尚未更新（GPS 未锁定）：回退到重新定位快照
    const point = await location.requestAndLocate();
    if (point) {
      moveMap({
        ...point,
        latitudeDelta: LOCATE_DELTA,
        longitudeDelta: LOCATE_DELTA,
      });
    }
  }, [moveMap, location.requestAndLocate]);

  const handleUserLocationChange = useCallback(
    (loc: UserLocationUpdate) => {
      userLocationRef.current = loc; // 始终缓存最新蓝点坐标，供定位按钮复用
      if (alignedRef.current) return; // 仅首帧对齐一次，避免持续跟随
      alignedRef.current = true;
      moveMap(
        {
          latitude: loc.latitude,
          longitude: loc.longitude,
          latitudeDelta: LOCATE_DELTA,
          longitudeDelta: LOCATE_DELTA,
        },
        0 // 无动画：与首帧无缝衔接，仅修正两源偏差（通常仅几十米，肉眼不可见）
      );
    },
    [moveMap]
  );

  // 右侧按钮组「拍照」：调用系统相机拍摄，照片自动保存到系统相册。
  // 相册媒体监听（mediaLibraryDidChange）会感知新照片，地图照片标记随之增量出现。
  const handleTakePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('无法使用相机', '请在系统设置中允许 Omni 访问相机。');
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled || result.assets.length === 0) return;
      const uri = result.assets[0].uri;
      // web 端 MediaLibrary 保存能力有限，仅原生端保存到系统相册。
      // SDK 57 用新的 class-based API（Asset.create）替代已废弃的 saveToLibraryAsync。
      if (Platform.OS !== 'web') {
        const { status } = await requestMediaLibraryPermissionsAsync(true);
        if (status !== 'granted') {
          Alert.alert('无法保存照片', '请在系统设置中允许 Omni 保存照片到相册。');
          return;
        }
        await Asset.create(uri);
      }
    } catch (err) {
      console.error('[handleTakePhoto] 拍照或保存失败', err);
      Alert.alert('拍照失败', '无法调用相机，请重试。');
    }
  }, []);

  // 可见路径（图层总开关为关时为空数组）：稳定引用，避免每次渲染新建数组破坏 RoutePolylines 的 memo 隔离。
  const visibleRoutes = useMemo(() => (layers.routes ? routes : []), [layers.routes, routes]);
  // 可见标点（图层「标点」为关时为空数组）：稳定引用，避免破坏 PlacemarkMarkers 的 memo 隔离。
  // 坐标为长按地图取回的原生坐标（与个人面板点击定位同源），无需 GCJ-02 转换。
  const visiblePlacemarks = useMemo(
    () => (layers.placemarks ? placemarks : []),
    [layers.placemarks, placemarks]
  );
  // 录制中的实时轨迹：作为一条临时 Route（红色）叠加显示，结束后转为正式路线
  const liveRoute = useMemo<Route | null>(() => {
    if (tracker.status === 'idle' || tracker.points.length < 2) return null;
    return {
      id: 'live-record',
      name: '绘制中',
      format: 'record',
      segments: [{ points: tracker.points }],
      originalSegments: [{ points: tracker.points }],
      visible: true,
      color: '#FF3B30',
      coordMode: 'raw',
      importedAt: Date.now(),
    };
  }, [tracker.status, tracker.points]);
  const mapRoutes = useMemo(
    () => (liveRoute ? [...visibleRoutes, liveRoute] : visibleRoutes),
    [visibleRoutes, liveRoute]
  );

  // 定位中：显示 loading，不渲染地图
  if (!resolvedRegion) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.locatingOverlay}>
          <ActivityIndicator size="large" color={theme.text} />
          <ThemedText type="small" themeColor="textSecondary">
            正在定位…
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SatelliteMap
        ref={mapRef}
        initialRegion={resolvedRegion}
        mapType={mapType}
        markers={markers}
        photoMarkers={photoMarkers}
        placemarks={visiblePlacemarks}
        routes={mapRoutes}
        onPhotoPress={setSelectedPhoto}
        onClusterPress={handlePhotoClusterPress}
        showsUserLocation
        onRegionChangeComplete={handleRegionChange}
        onUserLocationChange={handleUserLocationChange}
        onPress={handleMapPress}
        onLongPress={handleMapLongPress}
        onRegionChange={handleRegionChange}
      />

      {/* 底部搜索框：位于原 Tab 栏位置，结果列表向上展开（见 MapSearchBar） */}
      <View style={[styles.searchWrap, { bottom: insets.bottom + Spacing.two }]}>

        <MapSearchBar ref={searchBarRef} onSelect={handleSelectResult} onFocusChange={setSearchActive} />
      </View>

      {/* 长按地图「保存标点」悬浮卡片：红点 + 坐标卡片渲染在长按点上方（内部实现）；
          地图点击/移动/保存后由 moveMap/handleMapPress 关闭 */}
      {savePlacemarkTarget && (
        <MapSavePlacemarkCard
          latitude={savePlacemarkTarget.latitude}
          longitude={savePlacemarkTarget.longitude}
          x={savePlacemarkTarget.x}
          y={savePlacemarkTarget.y}
          defaultName={`标点 ${placemarks.length + 1}`}
          onSave={(name) => {
            addPlacemark(name, savePlacemarkTarget.latitude, savePlacemarkTarget.longitude);
            setSavePlacemarkTarget(null);
          }}
          onClose={() => {
            setSavePlacemarkTarget(null);
          }}
        />
      )}

      {/* 右下悬浮操作组：我的 / 拍照 / 路径绘制 / 海拔高度测速 / 图层 / 定位（自上而下）。
          无底部 Tab：按钮组置于底部搜索框上方（bottom 含 BOTTOM_BAR_OFFSET 偏移）。
          图层选择器浮层作为本容器的 absolute 子元素，定位到「图层」按钮左侧并垂直居中。
          搜索会话激活时整组隐藏（见 searchActive）：iOS 键盘避让把搜索框上移、结果列表上展
          都会进入按钮组区域，固定定位的按钮组会遮住搜索框/结果列表，故会话期间不渲染。 */}
      {!searchActive && (
      <View style={[styles.floatingBtns, { bottom: insets.bottom + BOTTOM_BAR_OFFSET }]}>
        <MapFloatingButton
          symbol={{ ios: 'person.fill', android: 'person', web: 'person' }}
          onPress={() => {
            // 互斥：打开「我的」时关闭图层浮层与海拔面板
            setLayerMenuVisible(false);
            setAltitudeVisible(false);
            setProfileVisible(true);
          }}
          accessibilityLabel="我的"
        />
        <MapFloatingButton
          symbol={{ ios: 'camera.fill', android: 'camera_alt', web: 'camera_alt' }}
          onPress={handleTakePhoto}
          accessibilityLabel="拍照"
        />
        <MapFloatingButton
          symbol={{
            ios: 'point.topleft.down.curvedto.point.bottomright.up',
            android: 'route',
            web: 'route',
          }}
          onPress={() => {
            // 互斥：打开「路径绘制」时关闭图层浮层与个人面板
            setLayerMenuVisible(false);
            setProfileVisible(false);
            setAltitudeVisible(false);
            setTrackPanelVisible(true);
          }}
          accessibilityLabel="路径绘制"
        />
        <MapFloatingButton
          symbol={{ ios: 'mountain.2.fill', android: 'terrain', web: 'terrain' }}
          onPress={() => {
            // 互斥：打开「海拔高度」时关闭图层浮层、个人面板与路径绘制面板
            setLayerMenuVisible(false);
            setProfileVisible(false);
            setTrackPanelVisible(false);
            setAltitudeVisible(true);
          }}
          accessibilityLabel="海拔高度测速"
        />
        {/* 包一层 View 以 onLayout 取「图层」按钮在按钮组内的位置/尺寸，供浮层定位 */}
        <View
          onLayout={(e) => {
            const { y, width, height } = e.nativeEvent.layout;
            setLayerBtnLayout({ y, width, height });
          }}>
          <MapFloatingButton
            symbol={{ ios: 'square.stack.3d.up.fill', android: 'layers', web: 'layers' }}
            onPress={() => {
              // 互斥：打开「图层」时关闭个人面板与海拔面板
              setProfileVisible(false);
              setAltitudeVisible(false);
              // 已打开则仅关闭自己（toggle off）；未打开则展开（多选器常驻）
              if (layerMenuVisible) {
                setLayerMenuVisible(false);
              } else {
                setLayerMenuVisible(true);
              }
            }}
            accessibilityLabel="图层"
          />
        </View>
        <MapFloatingButton
          symbol={{ ios: 'scope', android: 'gps_fixed', web: 'gps_fixed' }}
          onPress={handleLocate}
          accessibilityLabel="返回当前位置"
        />

        {/* 图层多选器浮层：absolute 定位到「图层」按钮左侧、与按钮同高并垂直居中。
            容器 top/height 对齐按钮，内部 justifyContent 居中菜单，无需 transform 百分比。
            勾选项切换地图上路径/照片的显隐，不收起浮层（多选器行为）。 */}
        {layerMenuVisible && layerBtnLayout && (
          <View
            style={[
              styles.layerMenu,
              {
                top: layerBtnLayout.y,
                height: layerBtnLayout.height,
                right: layerBtnLayout.width + Spacing.two,
              },
            ]}>
            <MapLayerMenu
              layers={layers}
              onToggle={(key) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
            />
          </View>
        )}
      </View>
      )}

      {/* 路径绘制面板：右侧「路径绘制」按钮打开；开始/暂停/继续/结束由面板按钮控制。
          关闭面板不停止录制（hook 在本页持有，GPS 订阅继续），重新打开可查看进度。 */}
      <TrackRecordPanel
        visible={trackPanelVisible}
        status={tracker.status}
        pointCount={tracker.points.length}
        distanceM={tracker.distanceM}
        elapsedMs={tracker.elapsedMs}
        altitudeM={tracker.altitudeM}
        onStart={async () => {
          const ok = await tracker.start();
          if (!ok) {
            Alert.alert('无法开始录制', '请在系统设置中允许 Omni 访问位置。');
          }
        }}
        onPause={tracker.pause}
        onResume={tracker.resume}
        onStop={() => {
          const pts = tracker.stop();
          if (pts.length >= 2) addRecordedRoute(pts);
          setTrackPanelVisible(false);
        }}
        // 中央主按钮开始后变「拍照」：复用右上角「拍照」逻辑（相机 → 保存相册 → 相册监听增量显示标记）
        onCapture={handleTakePhoto}
        onClose={() => setTrackPanelVisible(false)}
      />

      {/* 照片详情面板：点击地图照片图片 Marker 后从底部滑出 */}
      <PhotoDetailSheet photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />

      {/* 海拔高度面板：右侧「海拔高度测速」按钮打开；打开期间由面板内部 GPS 订阅实时刷新 */}
      <AltitudeSheet visible={altitudeVisible} onClose={() => setAltitudeVisible(false)} />

      {/* 「我的」个人中心面板：点击「我的」按钮后从底部滑出。
          路径管理（原右侧按钮组「路径」按钮功能）已迁移到「路径」扩展态：
          导入后自动定位到最后一条路线；点击路线名称定位。 */}
      <ProfileSheet
        visible={profileVisible}
        user={user}
        photoCount={photoCount}
        routeCount={routes.length}
        routes={routes}
        placemarkCount={placemarks.length}
        placemarks={placemarks}
        onRemovePlacemark={removePlacemark}
        onSelectPlacemark={handleSelectPlacemark}
        mapType={mapType}
        onMapTypeChange={setMapType}
        routeLoading={routeLoading}
        routeError={routeError}
        onImportRoute={async () => {
          const imported = await importRoute();
          if (imported && imported.length > 0) {
            moveMap(getRouteRegion(imported[imported.length - 1]));
          }
        }}
        onToggleRoute={toggleRoute}
        onCycleCoordMode={cycleCoordMode}
        onRemoveRoute={removeRoute}
        onRenameRoute={renameRoute}
        onSelectRoute={(route) => {
          moveMap(getRouteRegion(route));
        }}
        onDismissRouteError={clearError}
        onLogin={login}
        onLogout={logout}
        onClose={() => setProfileVisible(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  locatingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  searchWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  floatingBtns: {
    position: 'absolute',
    right: Spacing.four,
    flexDirection: 'column',
    gap: Spacing.three,
  },
  /** 图层选择器浮层定位容器：right 把容器推到「图层」按钮左侧，top/height 运行时对齐按钮，
   *  内部 justifyContent 居中菜单、alignItems 让菜单右对齐紧贴按钮。 */
  layerMenu: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
});
