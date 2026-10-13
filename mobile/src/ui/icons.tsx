import * as React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/**
 * The few icons the app needs, drawn as Lucide draws them (the web's icon
 * set, ISC licence): 24-unit boxes, 2-unit round strokes.
 */
type IconProps = { size?: number; color: string };

function Icon({
  size = 24,
  color,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="m21 21-4.34-4.34" />
    <Circle cx={11} cy={11} r={8} />
  </Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="m15 18-6-6 6-6" />
  </Icon>
);

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <Circle cx={12} cy={7} r={4} />
  </Icon>
);

export const XIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M18 6 6 18" />
    <Path d="m6 6 12 12" />
  </Icon>
);

export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 19v3" />
    <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <Rect x={9} y={2} width={6} height={13} rx={3} />
  </Icon>
);

export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x={14} y={3} width={5} height={18} rx={1} />
    <Rect x={5} y={3} width={5} height={18} rx={1} />
  </Icon>
);
