"use client";

/**
 * Central icon module. The whole app imports icons from here (never from
 * `@mui/icons-material` directly), so the icon set can be swapped in one file.
 *
 * Icons are Lucide (`lucide-react`) wrapped in a thin MUI-compatible adapter so
 * existing call sites keep working unchanged: they still accept `fontSize`
 * ("small"|"medium"|"large"|"inherit" or a number), `color`, `sx`, and are
 * `aria-hidden` by default (like MUI's SvgIcon). Sizing works via `width/height:
 * 1em` scaled by `font-size` — identical to MUI icons — and Lucide strokes use
 * `currentColor`, so `sx={{ color: "success.main" }}` just works.
 */
import * as React from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import type { LucideIcon } from "lucide-react";
import {
  Snowflake, Clock, Plus, UserCog, ArrowLeft, ArrowRight, ClipboardList, Sparkles,
  ChartColumn, Zap, Bug, Building2, CircleX, Dices, Check, CircleCheck, ChevronLeft,
  ChevronRight, X, Code, CodeXml, Copy, Moon, Trash2, FileText, Server, Download,
  Pencil, Trophy, CircleAlert, ChevronUp, ChevronDown, Fingerprint, List, Maximize,
  ShieldCheck, Users, History, House, Hourglass, Network, ChartLine, Layers,
  ChartNoAxesColumn, Sun, Link, Flame, Lock, LogIn, LogOut, Mail, MemoryStick, Menu,
  BookOpen, Medal, Activity, Pause, Clock4, User, Play, ShieldAlert, Brain, CircleHelp,
  Circle, ReceiptText, RefreshCw, RotateCcw, Save, GraduationCap, Search, Tag, Send,
  Shield, Bot, LayoutDashboard, Timer, Lightbulb, Target, FileUp, Upload, LayoutGrid,
  Eye, EyeOff, TriangleAlert, Briefcase,
  SignalLow, SignalMedium, SignalHigh, Type, Hash, ArrowRightLeft, ArrowDownUp, GitFork,
  Boxes, Binary, PenTool, Waypoints,
} from "lucide-react";

export type IconFontSize = "small" | "medium" | "large" | "inherit";

export interface IconProps {
  fontSize?: IconFontSize | number | string;
  color?: string;
  sx?: SxProps<Theme>;
  className?: string;
  onClick?: React.MouseEventHandler;
  "aria-label"?: string;
  "aria-hidden"?: boolean;
  titleAccess?: string;
}

const FONT: Record<IconFontSize, string> = {
  small: "1.25rem",
  medium: "1.5rem",
  large: "2.1875rem",
  inherit: "inherit",
};

const PALETTE = new Set(["primary", "secondary", "error", "warning", "success", "info"]);
function mapColor(color?: string): string | undefined {
  if (!color) return undefined;
  if (PALETTE.has(color)) return `${color}.main`;
  if (color === "disabled") return "text.disabled";
  if (color === "action") return "action.active";
  return color; // "inherit", a palette path ("success.main"), or a raw CSS color
}

function makeIcon(LucideCmp: LucideIcon, displayName: string) {
  const Icon = React.forwardRef<SVGSVGElement, IconProps>(function Icon(
    { fontSize = "medium", color, sx, titleAccess, ...rest },
    ref,
  ) {
    const size = typeof fontSize === "string" && fontSize in FONT ? FONT[fontSize as IconFontSize] : fontSize;
    const labelled = Boolean(rest["aria-label"]) || Boolean(titleAccess);
    return (
      <Box
        ref={ref}
        component={LucideCmp as React.ElementType}
        aria-hidden={labelled ? undefined : true}
        aria-label={titleAccess || rest["aria-label"]}
        sx={{ width: "1em", height: "1em", fontSize: size, color: mapColor(color), flexShrink: 0, ...sx }}
        {...rest}
      />
    );
  });
  Icon.displayName = displayName;
  return Icon;
}

// ── Exports keep the names call sites already use (moduleName + "Icon") ──
export const AcUnitIcon = makeIcon(Snowflake, "AcUnitIcon");
export const AccessTimeIcon = makeIcon(Clock, "AccessTimeIcon");
export const AddIcon = makeIcon(Plus, "AddIcon");
export const AdminPanelSettingsOutlinedIcon = makeIcon(UserCog, "AdminPanelSettingsOutlinedIcon");
export const ArrowBackIcon = makeIcon(ArrowLeft, "ArrowBackIcon");
export const ArrowForwardIcon = makeIcon(ArrowRight, "ArrowForwardIcon");
export const AssignmentOutlinedIcon = makeIcon(ClipboardList, "AssignmentOutlinedIcon");
export const AutoAwesomeOutlinedIcon = makeIcon(Sparkles, "AutoAwesomeOutlinedIcon");
export const BarChartOutlinedIcon = makeIcon(ChartColumn, "BarChartOutlinedIcon");
export const BoltOutlinedIcon = makeIcon(Zap, "BoltOutlinedIcon");
export const BugReportOutlinedIcon = makeIcon(Bug, "BugReportOutlinedIcon");
export const BusinessOutlinedIcon = makeIcon(Building2, "BusinessOutlinedIcon");
export const CancelIcon = makeIcon(CircleX, "CancelIcon");
export const CancelOutlinedIcon = makeIcon(CircleX, "CancelOutlinedIcon");
export const CasinoOutlinedIcon = makeIcon(Dices, "CasinoOutlinedIcon");
export const CheckIcon = makeIcon(Check, "CheckIcon");
export const CheckCircleIcon = makeIcon(CircleCheck, "CheckCircleIcon");
export const CheckCircleOutlineIcon = makeIcon(CircleCheck, "CheckCircleOutlineIcon");
export const CheckCircleOutlinedIcon = makeIcon(CircleCheck, "CheckCircleOutlinedIcon");
export const ChevronLeftIcon = makeIcon(ChevronLeft, "ChevronLeftIcon");
export const ChevronRightIcon = makeIcon(ChevronRight, "ChevronRightIcon");
export const CloseIcon = makeIcon(X, "CloseIcon");
export const CodeIcon = makeIcon(Code, "CodeIcon");
export const CodeOffOutlinedIcon = makeIcon(CodeXml, "CodeOffOutlinedIcon");
export const CodeOutlinedIcon = makeIcon(Code, "CodeOutlinedIcon");
export const ContentCopyIcon = makeIcon(Copy, "ContentCopyIcon");
export const ContentCopyOutlinedIcon = makeIcon(Copy, "ContentCopyOutlinedIcon");
export const DarkModeOutlinedIcon = makeIcon(Moon, "DarkModeOutlinedIcon");
export const DeleteOutlineIcon = makeIcon(Trash2, "DeleteOutlineIcon");
export const DescriptionOutlinedIcon = makeIcon(FileText, "DescriptionOutlinedIcon");
export const DnsOutlinedIcon = makeIcon(Server, "DnsOutlinedIcon");
export const DownloadOutlinedIcon = makeIcon(Download, "DownloadOutlinedIcon");
export const EditOutlinedIcon = makeIcon(Pencil, "EditOutlinedIcon");
export const EmojiEventsOutlinedIcon = makeIcon(Trophy, "EmojiEventsOutlinedIcon");
export const ErrorOutlineIcon = makeIcon(CircleAlert, "ErrorOutlineIcon");
export const ExpandLessIcon = makeIcon(ChevronUp, "ExpandLessIcon");
export const ExpandMoreIcon = makeIcon(ChevronDown, "ExpandMoreIcon");
export const FingerprintOutlinedIcon = makeIcon(Fingerprint, "FingerprintOutlinedIcon");
export const FormatListBulletedOutlinedIcon = makeIcon(List, "FormatListBulletedOutlinedIcon");
export const FullscreenIcon = makeIcon(Maximize, "FullscreenIcon");
export const GppGoodOutlinedIcon = makeIcon(ShieldCheck, "GppGoodOutlinedIcon");
export const GroupsOutlinedIcon = makeIcon(Users, "GroupsOutlinedIcon");
export const HistoryOutlinedIcon = makeIcon(History, "HistoryOutlinedIcon");
export const HomeOutlinedIcon = makeIcon(House, "HomeOutlinedIcon");
export const HourglassEmptyOutlinedIcon = makeIcon(Hourglass, "HourglassEmptyOutlinedIcon");
export const HubOutlinedIcon = makeIcon(Network, "HubOutlinedIcon");
export const InsightsOutlinedIcon = makeIcon(ChartLine, "InsightsOutlinedIcon");
export const LayersOutlinedIcon = makeIcon(Layers, "LayersOutlinedIcon");
export const LeaderboardOutlinedIcon = makeIcon(ChartNoAxesColumn, "LeaderboardOutlinedIcon");
export const LightModeOutlinedIcon = makeIcon(Sun, "LightModeOutlinedIcon");
export const LinkOutlinedIcon = makeIcon(Link, "LinkOutlinedIcon");
export const ListAltOutlinedIcon = makeIcon(ClipboardList, "ListAltOutlinedIcon");
export const LocalFireDepartmentIcon = makeIcon(Flame, "LocalFireDepartmentIcon");
export const LocalFireDepartmentOutlinedIcon = makeIcon(Flame, "LocalFireDepartmentOutlinedIcon");
export const LockOutlinedIcon = makeIcon(Lock, "LockOutlinedIcon");
export const LoginIcon = makeIcon(LogIn, "LoginIcon");
export const LogoutIcon = makeIcon(LogOut, "LogoutIcon");
export const MailOutlineIcon = makeIcon(Mail, "MailOutlineIcon");
export const MemoryOutlinedIcon = makeIcon(MemoryStick, "MemoryOutlinedIcon");
export const MenuIcon = makeIcon(Menu, "MenuIcon");
export const MenuBookOutlinedIcon = makeIcon(BookOpen, "MenuBookOutlinedIcon");
export const MilitaryTechOutlinedIcon = makeIcon(Medal, "MilitaryTechOutlinedIcon");
export const MonitorHeartOutlinedIcon = makeIcon(Activity, "MonitorHeartOutlinedIcon");
export const PauseOutlinedIcon = makeIcon(Pause, "PauseOutlinedIcon");
export const PendingOutlinedIcon = makeIcon(Clock4, "PendingOutlinedIcon");
export const PeopleOutlineIcon = makeIcon(Users, "PeopleOutlineIcon");
export const PersonOutlineIcon = makeIcon(User, "PersonOutlineIcon");
export const PlayArrowIcon = makeIcon(Play, "PlayArrowIcon");
export const PlayArrowOutlinedIcon = makeIcon(Play, "PlayArrowOutlinedIcon");
export const PolicyOutlinedIcon = makeIcon(ShieldAlert, "PolicyOutlinedIcon");
export const PsychologyOutlinedIcon = makeIcon(Brain, "PsychologyOutlinedIcon");
export const QuizOutlinedIcon = makeIcon(CircleHelp, "QuizOutlinedIcon");
export const RadioButtonUncheckedIcon = makeIcon(Circle, "RadioButtonUncheckedIcon");
export const ReceiptLongOutlinedIcon = makeIcon(ReceiptText, "ReceiptLongOutlinedIcon");
export const RefreshIcon = makeIcon(RefreshCw, "RefreshIcon");
export const RefreshOutlinedIcon = makeIcon(RefreshCw, "RefreshOutlinedIcon");
export const RestartAltOutlinedIcon = makeIcon(RotateCcw, "RestartAltOutlinedIcon");
export const SaveOutlinedIcon = makeIcon(Save, "SaveOutlinedIcon");
export const SchoolOutlinedIcon = makeIcon(GraduationCap, "SchoolOutlinedIcon");
export const SearchIcon = makeIcon(Search, "SearchIcon");
export const SellOutlinedIcon = makeIcon(Tag, "SellOutlinedIcon");
export const SendIcon = makeIcon(Send, "SendIcon");
export const ShieldOutlinedIcon = makeIcon(Shield, "ShieldOutlinedIcon");
export const SmartToyOutlinedIcon = makeIcon(Bot, "SmartToyOutlinedIcon");
export const SpaceDashboardOutlinedIcon = makeIcon(LayoutDashboard, "SpaceDashboardOutlinedIcon");
export const TimerOutlinedIcon = makeIcon(Timer, "TimerOutlinedIcon");
export const TipsAndUpdatesOutlinedIcon = makeIcon(Lightbulb, "TipsAndUpdatesOutlinedIcon");
export const TrackChangesOutlinedIcon = makeIcon(Target, "TrackChangesOutlinedIcon");
export const UploadFileOutlinedIcon = makeIcon(FileUp, "UploadFileOutlinedIcon");
export const UploadOutlinedIcon = makeIcon(Upload, "UploadOutlinedIcon");
export const ViewModuleOutlinedIcon = makeIcon(LayoutGrid, "ViewModuleOutlinedIcon");
export const VisibilityIcon = makeIcon(Eye, "VisibilityIcon");
export const VisibilityOffIcon = makeIcon(EyeOff, "VisibilityOffIcon");
export const VisibilityOffOutlinedIcon = makeIcon(EyeOff, "VisibilityOffOutlinedIcon");
export const VisibilityOutlinedIcon = makeIcon(Eye, "VisibilityOutlinedIcon");
export const WarningAmberIcon = makeIcon(TriangleAlert, "WarningAmberIcon");
export const WarningAmberOutlinedIcon = makeIcon(TriangleAlert, "WarningAmberOutlinedIcon");
export const WorkOutlineOutlinedIcon = makeIcon(Briefcase, "WorkOutlineOutlinedIcon");
// Difficulty tiers + topic/subcategory icons.
export const SignalLowIcon = makeIcon(SignalLow, "SignalLowIcon");
export const SignalMediumIcon = makeIcon(SignalMedium, "SignalMediumIcon");
export const SignalHighIcon = makeIcon(SignalHigh, "SignalHighIcon");
export const TypeIcon = makeIcon(Type, "TypeIcon");
export const HashIcon = makeIcon(Hash, "HashIcon");
export const ArrowRightLeftIcon = makeIcon(ArrowRightLeft, "ArrowRightLeftIcon");
export const ArrowDownUpIcon = makeIcon(ArrowDownUp, "ArrowDownUpIcon");
export const GitForkIcon = makeIcon(GitFork, "GitForkIcon");
export const BoxesIcon = makeIcon(Boxes, "BoxesIcon");
export const BinaryIcon = makeIcon(Binary, "BinaryIcon");
export const PenToolIcon = makeIcon(PenTool, "PenToolIcon");
export const WaypointsIcon = makeIcon(Waypoints, "WaypointsIcon");
