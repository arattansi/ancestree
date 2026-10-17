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

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M20 6 9 17l-5-5" />
  </Icon>
);

// The messenger's (Step 179.1), as the web's pop-up draws them.

/** A dialogue box: messages, in the leaf's header and, from 179.4, the menu bar. */
export const MessageSquareIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
  </Icon>
);

export const SquarePenIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <Path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
  </Icon>
);

export const LockKeyholeIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx={12} cy={16} r={1} />
    <Rect x={3} y={10} width={18} height={12} rx={2} />
    <Path d="M7 10V7a5 5 0 0 1 10 0v3" />
  </Icon>
);

export const EllipsisIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx={12} cy={12} r={1} />
    <Circle cx={19} cy={12} r={1} />
    <Circle cx={5} cy={12} r={1} />
  </Icon>
);

export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z" />
    <Path d="M6 12h16" />
  </Icon>
);

export const ShieldCheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <Path d="m9 12 2 2 4-4" />
  </Icon>
);

export const BellOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M10.268 21a2 2 0 0 0 3.464 0" />
    <Path d="M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742" />
    <Path d="m2 2 20 20" />
    <Path d="M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05" />
  </Icon>
);

export const ScanQrCodeIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M17 12v4a1 1 0 0 1-1 1h-4" />
    <Path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <Path d="M17 8V7" />
    <Path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <Path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <Path d="M7 17h.01" />
    <Path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <Rect x={7} y={7} width={5} height={5} rx={1} />
  </Icon>
);
