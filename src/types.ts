// Minimal type shapes for Jellyfin API responses. These cover the fields this
// MCP actually reads — not the full API surface. Anything else is passed
// through as `unknown` and re-serialized back to the caller.

export interface SystemInfo {
  ServerName: string;
  Version: string;
  Id: string;
  OperatingSystemDisplayName?: string;
  SystemArchitecture?: string;
  LocalAddress?: string;
  HasPendingRestart?: boolean;
  HasUpdateAvailable?: boolean;
  [key: string]: unknown;
}

export interface Library {
  Name: string;
  Locations: string[];
  CollectionType?: string;
  ItemId: string;
  [key: string]: unknown;
}

export interface UserPolicy {
  IsAdministrator?: boolean;
  IsDisabled?: boolean;
  [key: string]: unknown;
}

export interface User {
  Id: string;
  Name: string;
  LastLoginDate?: string;
  LastActivityDate?: string;
  Policy?: UserPolicy;
  [key: string]: unknown;
}

export interface PlayState {
  PositionTicks?: number;
  IsPaused?: boolean;
  IsMuted?: boolean;
  VolumeLevel?: number;
  PlayMethod?: string;
  [key: string]: unknown;
}

export interface NowPlayingItem {
  Id: string;
  Name: string;
  Type: string;
  SeriesName?: string;
  RunTimeTicks?: number;
  ProductionYear?: number;
  [key: string]: unknown;
}

export interface Session {
  Id: string;
  UserId?: string;
  UserName?: string;
  Client?: string;
  DeviceName?: string;
  DeviceId?: string;
  ApplicationVersion?: string;
  RemoteEndPoint?: string;
  NowPlayingItem?: NowPlayingItem;
  PlayState?: PlayState;
  [key: string]: unknown;
}

export interface Item {
  Id: string;
  Name: string;
  Type: string;
  SeriesName?: string;
  ProductionYear?: number;
  DateCreated?: string;
  RunTimeTicks?: number;
  [key: string]: unknown;
}

export interface ItemsResponse {
  Items: Item[];
  TotalRecordCount: number;
  StartIndex?: number;
}

export interface ActivityLogEntry {
  Id: number;
  Name: string;
  Type: string;
  Date: string;
  Severity: string;
  UserId?: string;
  ShortOverview?: string;
  Overview?: string;
  [key: string]: unknown;
}

export interface ActivityLogResponse {
  Items: ActivityLogEntry[];
  TotalRecordCount: number;
}

export interface ScheduledTask {
  Id: string;
  Name: string;
  Description?: string;
  Category?: string;
  State: string;
  CurrentProgressPercentage?: number;
  LastExecutionResult?: {
    StartTimeUtc?: string;
    EndTimeUtc?: string;
    Status?: string;
    ErrorMessage?: string;
  };
  [key: string]: unknown;
}
