/**
 * Types for the subset of the Cult.fit API this app touches. Reverse-engineered
 * from live responses; fields the app does not use are omitted or left loose.
 */

export type ClassState =
  | "AVAILABLE"
  | "WAITLIST_AVAILABLE"
  | "SEAT_NOT_AVAILABLE"
  | "WAITLIST_FULL"
  | "BOOKED"
  | (string & {});

/** One class in `classByDateMap[date].classByTimeList[].centerWiseClasses[].classes[]`. */
export interface CultClass {
  /** Opaque numeric string. This is the id passed to the book endpoint. */
  id: string;
  workoutId: number;
  workoutName: string;
  startTime: string; // "HH:mm:ss"
  endTime: string; // "HH:mm:ss"
  /** Note the capital ID — the wrapper object uses `centerId` instead. */
  centerID: number;
  availableSeats: number;
  state: ClassState;
  isBooked?: boolean;
  waitlistInfo?: { waitlistedUserCount: number };
}

export interface CenterWiseClasses {
  centerId: number;
  classes: CultClass[];
}

export interface TimeSlot {
  /** "HH:mm:ss" */
  id: string;
  isLive?: boolean;
  centerWiseClasses: CenterWiseClasses[];
}

export interface DaySchedule {
  /** "YYYY-MM-DD" — same value as the matching `days[].id`. */
  id: string;
  classByTimeList: TimeSlot[];
}

export interface ScheduleResponse {
  header?: { title?: string };
  days: { id: string }[];
  centerInfoMap: Record<
    string,
    { centerName?: string; name?: string; verticalName?: string; isNew?: boolean }
  >;
  timeSlotOptions?: {
    slot: string;
    icon: string;
    displayText: string;
    startTime: string;
  }[];
  classByDateMap: Record<string, DaySchedule>;
}

/** One entry from `GET /api/cult/centers`. */
export interface CenterDirectoryEntry {
  id: number;
  name: string;
  centerServiceId?: number;
  action?: string;
  address?: {
    addressString?: string;
    locality?: string;
    latLong?: { lat: number; long: number };
    mapUrl?: string;
    pincode?: string;
  };
}

/** One entry from `GET /api/user/cities/v2` -> countries[].cities[]. */
export interface City {
  cityId: string;
  countryId: string;
  name: string;
  timezone: string;
  lat: number;
  lon: number;
  isSelected?: boolean;
  isPopular?: boolean;
}

export interface CitiesResponse {
  countries: { title: string; countryId: string; cities: City[] }[];
  selectedCity?: string;
}

/** A booking attempt outcome, mirrored into local history. */
export type BookingStatus =
  | "booked"
  | "waitlisted"
  | "skipped"
  | "dry-run"
  | "unavailable"
  | "error";

export interface BookingResult {
  status: BookingStatus;
  message: string;
  date?: string;
  klass?: EnrichedClass;
}

/** A matched class with the dimensions that selected it attached. */
export interface EnrichedClass extends CultClass {
  centerId: number;
  centerName: string | null;
  slot: string; // "HH:mm:ss"
}
