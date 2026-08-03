/**
 * 首页：卫星地图视图。
 *
 * 打开 app 时自动定位到用户当前位置：
 * - 定位中：显示 loading 覆盖层，不渲染地图（避免默认坐标闪现）
 * - 定位成功：地图首次渲染即为当前位置（无跳转动画）
 * - 定位失败：回退到默认坐标（INITIAL_REGION）
 *
 * 地图交互：
 * - 长按空白：在该点显示浮动信息卡片（经纬度），不用 Marker/Callout，无图标无竞态
 * - 单击空白：清空 Marker 与浮动卡片
 * - 搜索框：输入地址跳转并落 Marker
 * - 定位按钮：跳回当前位置
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BubbleTail } from '@/components/bubble-tail';
import { GlassPanel } from '@/components/glass-panel';
import { MapFloatingButton } from '@/components/map-floating-button';
import { MapLayerMenu, type LayerKey } from '@/components/map-layer-menu';
import { MapSearchBar } from '@/components/map-search-bar';
import { PhotoDetailSheet } from '@/components/photo-detail-sheet';
import { ProfileSheet } from '@/components/profile-sheet';
import { RouteManagerPanel } from '@/components/route-manager-panel';
import { SatelliteMap } from '@/components/satellite-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { INITIAL_REGION } from '@/constants/map';
import { Glass, Spacing } from '@/constants/theme';
import { useGeotaggedPhotos } from '@/hooks/use-geotagged-photos';
import { useHeading } from '@/hooks/use-heading';
import { useLocation } from '@/hooks/use-location';
import { useRoutes } from '@/hooks/use-routes';
import { useTheme } from '@/hooks/use-theme';
import type { GeoTaggedPhoto } from '@/types/geotagged-photo';
import type {
  GeoPoint,
  MapLongPressEvent,
  MapMarker,
  MapRegion,
  MapType,
  SatelliteMapHandle,
  UserLocationUpdate,
} from '@/types/map';
import { wgs84ToGcj02, withConvertedCoords } from '@/utils/coord-transform';
import { getRouteRegion } from '@/utils/route-parser';

/** 定位成功后的缩放级别（约城市街区尺度）。 */
const LOCATE_DELTA = 0.02;

/** 长按位置红色标记小球尺寸（px）。 */
const DOT_SIZE = 12;
const DOT_RADIUS = DOT_SIZE / 2;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<SatelliteMapHandle>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  // 长按查坐标的浮动信息卡片（null = 不显示）；用屏幕像素坐标定位，不在 react-native-maps 内
  const [popup, setPopup] = useState<{
    x: number;
    y: number;
    title: string;
    subtitle: string;
  } | null>(null);
  // null = 定位中；非 null = 定位完成（成功取当前位置，失败取默认坐标）
  const [resolvedRegion, setResolvedRegion] = useState<MapRegion | null>(null);
  const location = useLocation();
  // 设备磁力计真北朝向：驱动地图蓝点上的 heading cone（半透明锥形方向指示）。
  // Web 端 available=false，heading=null，SatelliteMap 不渲染 cone。
  const heading = useHeading();
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  // 设备照片 EXIF 地理标记：在地图上以图片 Marker 形式展示，点击弹出底部详情面板
  const { photos } = useGeotaggedPhotos();
  // 当前选中的照片（非 null 时弹出底部详情面板）
  const [selectedPhoto, setSelectedPhoto] = useState<GeoTaggedPhoto | null>(null);
  // 地图图层类型（标准 / 卫星 / 天气），由「我的」面板切换
  const [mapType, setMapType] = useState<MapType>('hybrid');
  // 图层显隐开关（多选）：控制地图上路径 / 照片是否显示，由图层多选器切换
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ routes: true, photos: true });
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
  const { routes, loading: routeLoading, error: routeError, importRoute, toggleRoute, cycleCoordMode, removeRoute, clearError } = useRoutes();
  // 路径管理浮层是否展开
  const [routePanelVisible, setRoutePanelVisible] = useState(false);
  // 「我的」个人中心底部卡片是否展开
  const [profileVisible, setProfileVisible] = useState(false);
  // 「路径」按钮在按钮组内的位置/尺寸，用于把浮层定位到按钮左侧并垂直居中
  const [routeBtnLayout, setRouteBtnLayout] = useState<{
    y: number;
    width: number;
    height: number;
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

  /** 统一封装编程移动地图：先清浮动卡片与图层浮层（像素坐标随地图移动失效），再 animate。
   *  新增地图操作（定位/搜索/其他按钮）只需调 moveMap，无需手动清 popup / 关浮层。
   *  手势拖拽由 onRegionChange 兜底清除。 */
  const moveMap = (region: MapRegion, durationMs = 600) => {
    setPopup(null);
    setLayerMenuVisible(false);
    setRoutePanelVisible(false);
    mapRef.current?.animateToRegion(region, durationMs);
  };

  const handleSelectResult = (point: GeoPoint, title: string) => {
    setMarkers([{ ...point, title }]); // 搜索结果：显示默认大头针图标
    moveMap({ ...point, latitudeDelta: 0.01, longitudeDelta: 0.01 });
  };

  // 长按地图空白：在该点显示浮动信息卡片（经纬度），不用 Marker/Callout，无图标无竞态
  const handleMapLongPress = (e: MapLongPressEvent) => {
    setMarkers([]); // 清搜索 Marker
    setPopup({
      x: e.position.x,
      y: e.position.y,
      title: `纬度 ${e.coordinate.latitude.toFixed(6)}°`,
      subtitle: `经度 ${e.coordinate.longitude.toFixed(6)}°`,
    });
  };

  // 单击地图空白：清空 Marker、浮动卡片与图层/路径浮层
  const handleMapPress = () => {
    setMarkers([]);
    setPopup(null);
    setLayerMenuVisible(false);
    setRoutePanelVisible(false);
  };

  // 手势拖拽/缩放时浮动卡片像素坐标失效，需清除；图层/路径浮层一并关闭。
  // 编程移动（定位/搜索）由 moveMap 统一清；此处仅兜底手势场景。
  const handleRegionChange = () => {
    setPopup(null);
    setLayerMenuVisible(false);
    setRoutePanelVisible(false);
  };

  // 蓝点由系统持续定位（精度通常高于单次快照）。缓存其最新坐标，供首帧对齐与定位按钮复用，
  // 确保地图中心与蓝点始终同源、不会因"快照 vs 系统定位"两源不一致而漂移。
  const alignedRef = useRef(false);
  const userLocationRef = useRef<UserLocationUpdate | null>(null);

  const handleLocate = async () => {
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
  };

  const handleUserLocationChange = (loc: UserLocationUpdate) => {
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
  };

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
        routes={layers.routes ? routes : []}
        heading={heading.heading}
        onPhotoPress={setSelectedPhoto}
        showsUserLocation
        onUserLocationChange={handleUserLocationChange}
        onPress={handleMapPress}
        onLongPress={handleMapLongPress}
        onRegionChange={handleRegionChange}
      />

      <View style={[styles.searchWrap, { top: insets.top + Spacing.two }]}>
        <MapSearchBar onSelect={handleSelectResult} />
      </View>

      {/* 右下悬浮操作组：我的 / 图层 / 定位（自上而下）。
          NativeTabs 把底部 Tab 栏计入子页面 insets.bottom，故此处只需 insets.bottom + 间距。
          图层选择器浮层作为本容器的 absolute 子元素，定位到「图层」按钮左侧并垂直居中。 */}
      <View style={[styles.floatingBtns, { bottom: insets.bottom + Spacing.three }]}>
        <MapFloatingButton
          symbol={{ ios: 'person.fill', android: 'person', web: 'person' }}
          onPress={() => {
            // 互斥：打开「我的」时关闭图层/路径浮层
            setLayerMenuVisible(false);
            setRoutePanelVisible(false);
            setProfileVisible(true);
          }}
          accessibilityLabel="我的"
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
              // 互斥：打开图层菜单时关闭路径面板；已打开则仅关闭自己（toggle off）
              if (layerMenuVisible) {
                setLayerMenuVisible(false);
              } else {
                setRoutePanelVisible(false);
                setLayerMenuVisible(true);
              }
            }}
            accessibilityLabel="图层"
          />
        </View>
        {/* 「路径」按钮：同 onLayout 模式测量位置，供路径管理浮层定位 */}
        <View
          onLayout={(e) => {
            const { y, width, height } = e.nativeEvent.layout;
            setRouteBtnLayout({ y, width, height });
          }}>
          <MapFloatingButton
            symbol={{
              ios: 'point.topleft.down.curvedto.point.bottomright.up',
              android: 'route',
              web: 'route',
            }}
            onPress={() => {
              // 互斥：打开路径面板时关闭图层菜单；已打开则仅关闭自己（toggle off）
              if (routePanelVisible) {
                setRoutePanelVisible(false);
              } else {
                setLayerMenuVisible(false);
                setRoutePanelVisible(true);
              }
            }}
            accessibilityLabel="路径"
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

        {/* 路径管理浮层：同图层浮层定位模式，absolute 到「路径」按钮左侧并垂直居中。
            导入后自动定位到最后一条路线；点击路线名称定位并收起浮层。 */}
        {routePanelVisible && routeBtnLayout && (
          <View
            style={[
              styles.routePanel,
              {
                top: routeBtnLayout.y,
                height: routeBtnLayout.height,
                right: routeBtnLayout.width + Spacing.two,
              },
            ]}>
            <RouteManagerPanel
              routes={routes}
              loading={routeLoading}
              error={routeError}
              onImport={async () => {
                const imported = await importRoute();
                if (imported && imported.length > 0) {
                  // 导入后自动定位到最后一条路线的包围盒
                  moveMap(getRouteRegion(imported[imported.length - 1]));
                }
              }}
              onToggle={toggleRoute}
              onCycleCoordMode={cycleCoordMode}
              onRemove={removeRoute}
              onSelect={(route) => {
                moveMap(getRouteRegion(route));
              }}
              onDismissError={clearError}
            />
          </View>
        )}
      </View>

      {popup && (
        <>
          {/* 红色小球：标记长按位置 */}
          <View
            pointerEvents="none"
            style={[styles.popupDot, { left: popup.x, top: popup.y }]}
          />
          {/* 信息卡片 + 尾巴：尾巴尖端指向小球顶部 */}
          <View
            pointerEvents="none"
            style={[
              styles.popup,
              { left: popup.x, top: popup.y - DOT_RADIUS - Spacing.two },
            ]}>
            <GlassPanel style={styles.popupCardOuter} contentStyle={styles.popupCardContent}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {popup.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {popup.subtitle}
              </ThemedText>
            </GlassPanel>
            <BubbleTail
              direction="down"
              color={isDark ? Glass.overlayDark : Glass.overlayLight}
              size={6}
            />
          </View>
        </>
      )}

      {/* 照片详情面板：点击地图照片图片 Marker 后从底部滑出 */}
      <PhotoDetailSheet photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />

      {/* 「我的」个人中心面板：点击「我的」按钮后从底部滑出 */}
      <ProfileSheet
        visible={profileVisible}
        photoCount={photos.length}
        routeCount={routes.length}
        mapType={mapType}
        onMapTypeChange={setMapType}
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
    gap: Spacing.two,
  },
  /** 图层选择器浮层定位容器：right 把容器推到「图层」按钮左侧，top/height 运行时对齐按钮，
   *  内部 justifyContent 居中菜单、alignItems 让菜单右对齐紧贴按钮。 */
  layerMenu: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  /** 路径管理浮层定位容器：结构与 layerMenu 一致，定位到「路径」按钮左侧。 */
  routePanel: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  popup: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: '-50%' }, { translateY: '-100%' }],
  },
  /** 外层：圆角 + 阴影 + 最大宽度（不裁剪，阴影可见） */
  popupCardOuter: {
    borderRadius: 8,
    maxWidth: 240,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  /** 内层内容：padding/gap 移到 contentStyle */
  popupCardContent: {
    padding: Spacing.two,
    gap: 2,
  },
  popupDot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_RADIUS,
    backgroundColor: '#FF3B30',
    borderWidth: 2,
    borderColor: '#ffffff',
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
  },
});
