// Icon set (Phosphor) exposed under the names the app already uses, so pages keep their imports and class names.
import { forwardRef, type ComponentType } from 'react';
import {
  ArrowCounterClockwise as PArrowCounterClockwise,
  ArrowDown as PArrowDown,
  ArrowDownLeft as PArrowDownLeft,
  ArrowLeft as PArrowLeft,
  ArrowRight as PArrowRight,
  ArrowSquareOut as PArrowSquareOut,
  ArrowUp as PArrowUp,
  ArrowUpRight as PArrowUpRight,
  ArrowsDownUp as PArrowsDownUp,
  Bank as PBank,
  BookOpen as PBookOpen,
  BookOpenText as PBookOpenText,
  Buildings as PBuildings,
  CalendarBlank as PCalendarBlank,
  CaretDoubleLeft as PCaretDoubleLeft,
  CaretDoubleRight as PCaretDoubleRight,
  CaretDown as PCaretDown,
  CaretLeft as PCaretLeft,
  CaretRight as PCaretRight,
  CaretUpDown as PCaretUpDown,
  Check as PCheck,
  CheckCircle as PCheckCircle,
  Copy as PCopy,
  CreditCard as PCreditCard,
  DownloadSimple as PDownloadSimple,
  EnvelopeSimple as PEnvelopeSimple,
  FileCode as PFileCode,
  FileMagnifyingGlass as PFileMagnifyingGlass,
  FileText as PFileText,
  FileXls as PFileXls,
  Funnel as PFunnel,
  Gear as PGear,
  Globe as PGlobe,
  GridFour as PGridFour,
  Key as PKey,
  List as PList,
  Lock as PLock,
  MagnifyingGlass as PMagnifyingGlass,
  MapPin as PMapPin,
  Package as PPackage,
  PencilSimple as PPencilSimple,
  Phone as PPhone,
  Plus as PPlus,
  PlusCircle as PPlusCircle,
  Printer as PPrinter,
  Question as PQuestion,
  Receipt as PReceipt,
  Scales as PScales,
  SealCheck as PSealCheck,
  ShoppingCart as PShoppingCart,
  SignOut as PSignOut,
  SquaresFour as PSquaresFour,
  Trash as PTrash,
  TrendDown as PTrendDown,
  TrendUp as PTrendUp,
  UploadSimple as PUploadSimple,
  UserCheck as PUserCheck,
  UserGear as PUserGear,
  Users as PUsers,
  Wallet as PWallet,
  Warning as PWarning,
  WarningCircle as PWarningCircle,
  X as PX,
} from '@phosphor-icons/react/ssr';
import type { IconProps } from '@phosphor-icons/react';

type AppIcon = ComponentType<Omit<IconProps, 'ref'> & { strokeWidth?: number }>;

// Lucide icons default to 24px; Phosphor to 1em. Keep 24px unless the caller sets a size or Tailwind w-/h- classes.
function wrap(Icon: ComponentType<IconProps>): AppIcon {
  const Wrapped = forwardRef<SVGSVGElement, IconProps & { strokeWidth?: number }>(function AppIconImpl({ size = 24, strokeWidth: _ignored, ...rest }, ref) {
    return <Icon ref={ref} size={size} {...rest} />;
  });
  return Wrapped as AppIcon;
}

export const AlertCircle = wrap(PWarningCircle);
export const AlertTriangle = wrap(PWarning);
export const ArrowDown = wrap(PArrowDown);
export const ArrowDownLeft = wrap(PArrowDownLeft);
export const ArrowLeft = wrap(PArrowLeft);
export const ArrowRight = wrap(PArrowRight);
export const ArrowUp = wrap(PArrowUp);
export const ArrowUpDown = wrap(PArrowsDownUp);
export const ArrowUpRight = wrap(PArrowUpRight);
export const BookOpen = wrap(PBookOpen);
export const BookOpenCheck = wrap(PBookOpenText);
export const Building2 = wrap(PBuildings);
export const Calendar = wrap(PCalendarBlank);
export const Check = wrap(PCheck);
export const CheckCircle2 = wrap(PCheckCircle);
export const ChevronDown = wrap(PCaretDown);
export const ChevronLeft = wrap(PCaretLeft);
export const ChevronRight = wrap(PCaretRight);
export const ChevronsLeft = wrap(PCaretDoubleLeft);
export const ChevronsRight = wrap(PCaretDoubleRight);
export const ChevronsUpDown = wrap(PCaretUpDown);
export const CircleAlert = wrap(PWarningCircle);
export const CircleHelp = wrap(PQuestion);
export const Copy = wrap(PCopy);
export const CreditCard = wrap(PCreditCard);
export const Download = wrap(PDownloadSimple);
export const Edit3 = wrap(PPencilSimple);
export const ExternalLink = wrap(PArrowSquareOut);
export const FileCheck = wrap(PFileMagnifyingGlass);
export const FileCheck2 = wrap(PSealCheck);
export const FileCode2 = wrap(PFileCode);
export const FileSpreadsheet = wrap(PFileXls);
export const FileText = wrap(PFileText);
export const Filter = wrap(PFunnel);
export const Globe = wrap(PGlobe);
export const KeyRound = wrap(PKey);
export const Landmark = wrap(PBank);
export const LayoutDashboard = wrap(PSquaresFour);
export const LayoutGrid = wrap(PGridFour);
export const List = wrap(PList);
export const Lock = wrap(PLock);
export const LogOut = wrap(PSignOut);
export const Mail = wrap(PEnvelopeSimple);
export const MapPin = wrap(PMapPin);
export const Package = wrap(PPackage);
export const Phone = wrap(PPhone);
export const Plus = wrap(PPlus);
export const PlusCircle = wrap(PPlusCircle);
export const Printer = wrap(PPrinter);
export const Receipt = wrap(PReceipt);
export const RotateCcw = wrap(PArrowCounterClockwise);
export const Scale = wrap(PScales);
export const Search = wrap(PMagnifyingGlass);
export const Settings = wrap(PGear);
export const ShoppingCart = wrap(PShoppingCart);
export const Trash2 = wrap(PTrash);
export const TrendingDown = wrap(PTrendDown);
export const TrendingUp = wrap(PTrendUp);
export const Upload = wrap(PUploadSimple);
export const UserCheck = wrap(PUserCheck);
export const UserCog = wrap(PUserGear);
export const Users = wrap(PUsers);
export const Wallet = wrap(PWallet);
export const X = wrap(PX);
