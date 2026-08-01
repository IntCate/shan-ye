/**
 * 朝向锥形指示器（heading cone）：跟随定位蓝点，半透明扇形光束指示设备朝向。
 *
 * 视觉复刻 iOS Maps heading cone：
 *   - 扇形顶点（尖端）在蓝点，向外（heading 方向）发散
 *   - 径向渐变：近端（蓝点处）深色 → 远端浅色（雷达式），平滑无分界线
 *   - 顶角约 40°（±20°），与 iOS Maps cone 角度一致
 *
 * 渐变实现（SVG RadialGradient）：
 *   用 react-native-svg 的 RadialGradient + Path 画真正的径向渐变扇形，
 *   彻底消除 CSS border 三角形叠加的分界线问题（经验 559736 教训：
 *   几何形状应用 SVG 精确表达，不要用布局技巧近似）。
 *   - RadialGradient 中心 = 扇形顶点 = 蓝点，半径 = 扇形半径
 *   - Stop 0%（蓝点处）：深色（alpha 0.5）
 *   - Stop 100%（远端）：浅色（alpha 0.02）
 *   原生径向插值，放大无分界线。
 *
 * 扇形 Path 几何：
 *   顶点 V = (CX, CY) = 蓝点
 *   半角 HALF_ANGLE = 20°（顶角 40°）
 *   半径 R = 100
 *   左端点 L = (CX - R·sin(20°), CY - R·cos(20°))
 *   右端点 R = (CX + R·sin(20°), CY - R·cos(20°))
 *   Path: M CX,CY L Lx,Ly A R,R 0 0,1 Rx,Ry Z
 *   heading=0 时朝上（北）；rotate(heading) 绕蓝点旋转。
 *
 * 旋转中心（锚定方案，与 photo marker 同真机验证方案）：
 *   Marker anchor {0.5,1} + centerOffset {0,-BOX_HALF} → 盒子底边中心 = 蓝点
 *   内部 translateY(+BOX_HALF) 把 Dial 中心下移到盒子底边中心 = 蓝点
 *   Dial rotate 绕其中心转 = 绕蓝点转 ✓
 *
 * SVG viewBox 注意事项（react-native-svg 关键）：
 *   Svg viewBox 必须显式指定，否则在 RN Maps Marker children 中默认 viewBox 可能为 0 导致不渲染。
 *   用 viewBox="0 0 BOX BOX" 把逻辑坐标固定到画布 0..BOX，防止平台差异。
 */

import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { Defs, Path, RadialGradient, Stop, Svg } from 'react-native-svg';

import type { GeoPoint } from '@/types/map';

/** 旋转容器边长：需容纳扇形半径 + 旋转余量。 */
const BOX = 220;
const BOX_HALF = BOX / 2;

/** SVG 内部坐标系：蓝点 = (CX, CY) = 容器中心。 */
const CX = BOX_HALF;
const CY = BOX_HALF;

/** 扇形半径（px）：从蓝点到远端的距离。 */
const CONE_R = 100;
/** 扇形半角（度）：顶角 = 2 * HALF_ANGLE = 40°，与 iOS Maps 一致。 */
const HALF_ANGLE_DEG = 20;
/** 预计算 sin/cos（弧度），避免每次渲染重算。 */
const HALF_ANGLE_RAD = (HALF_ANGLE_DEG * Math.PI) / 180;
const SIN_HALF = Math.sin(HALF_ANGLE_RAD);
const COS_HALF = Math.cos(HALF_ANGLE_RAD);

/**
 * 扇形 Path 字符串：
 *   M CX,CY                          → 移动到顶点（蓝点）
 *   L (CX-R·sin, CY-R·cos)           → 画线到左端点
 *   A R,R 0 0,1 (CX+R·sin, CY-R·cos) → 圆弧到右端点（sweep=1 顺时针，走上方短弧）
 *   Z                                → 闭合回顶点
 */
const CONE_PATH = (() => {
  const leftX = CX - CONE_R * SIN_HALF;
  const leftY = CY - CONE_R * COS_HALF;
  const rightX = CX + CONE_R * SIN_HALF;
  const rightY = CY - CONE_R * COS_HALF;
  return `M ${CX},${CY} L ${leftX},${leftY} A ${CONE_R},${CONE_R} 0 0,1 ${rightX},${rightY} Z`;
})();

/** RadialGradient 唯一 id（SVG 内引用用）。 */
const GRADIENT_ID = 'headingConeGradient';

/** iOS Maps 蓝（#007AFF）。 */
const CONE_COLOR = '#007AFF';

type HeadingConeProps = {
  /** cone 锚定地理坐标（系统蓝点坐标）。 */
  coordinate: GeoPoint;
  /** 真北朝向角度（0-360，0=北，90=东）。 */
  heading: number;
};

function HeadingConeBase({ coordinate, heading }: HeadingConeProps) {
  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={{ x: 0, y: -BOX_HALF }}
      flat={false}
      tracksViewChanges={false}
    >
      <View style={styles.anchorWrapper} pointerEvents="none">
        <View style={[styles.translate, { transform: [{ translateY: BOX_HALF }] }]}>
          <View style={[styles.dial, { transform: [{ rotate: `${heading}deg` }] }]}>
            <Svg
              width={BOX}
              height={BOX}
              viewBox={`0 0 ${BOX} ${BOX}`}
              style={styles.svg}
              // react-native-svg 关键：显式 viewBox + preserveAspectRatio，
              // 防止 Marker children 默认渲染尺寸为 0。
              preserveAspectRatio="xMidYMid meet"
            >
              <Defs>
                <RadialGradient
                  id={GRADIENT_ID}
                  cx={`${CX}`}
                  cy={`${CY}`}
                  r={`${CONE_R}`}
                  // 关键：gradientUnits="userSpaceOnUse"
                  // cx/cy/r 直接用用户空间坐标（与 Path 同坐标系），
                  // 而非默认 objectBoundingBox（对象包围盒百分比）。
                  // RN Maps Marker children 中 objectBoundingBox 模式经常不生效。
                  gradientUnits="userSpaceOnUse"
                >
                  <Stop offset="0%" stopColor={CONE_COLOR} stopOpacity="0.5" />
                  <Stop offset="30%" stopColor={CONE_COLOR} stopOpacity="0.25" />
                  <Stop offset="70%" stopColor={CONE_COLOR} stopOpacity="0.08" />
                  <Stop offset="100%" stopColor={CONE_COLOR} stopOpacity="0.02" />
                </RadialGradient>
              </Defs>
              <Path d={CONE_PATH} fill={`url(#${GRADIENT_ID})`} />
            </Svg>
          </View>
        </View>
      </View>
    </Marker>
  );
}

export const HeadingCone = memo(HeadingConeBase);

const styles = StyleSheet.create({
  anchorWrapper: {
    width: BOX,
    height: BOX,
    position: 'relative',
  },
  translate: {
    width: BOX,
    height: BOX,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  dial: {
    width: BOX,
    height: BOX,
    position: 'relative',
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});