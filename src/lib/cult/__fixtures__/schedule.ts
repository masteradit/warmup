/**
 * A hand-built `classes/v2` fixture, shaped exactly like a real response
 * captured from www.cult.fit during planning, but trimmed and arranged to
 * exercise the schedule/rules logic deterministically.
 *
 * Centers: 3 "Cult HSR 19th Main", 220 "Cult HSR 24th Main", 267 "Cult HSR 14th Main"
 * Days: 2026-09-01 (Tuesday), 2026-09-02 (Wednesday)
 * States present: AVAILABLE, WAITLIST_AVAILABLE, SEAT_NOT_AVAILABLE, WAITLIST_FULL, BOOKED
 */

import type { ScheduleResponse } from "../types";

export const scheduleFixture: ScheduleResponse = {
  header: { title: "HSR Layout" },
  days: [{ id: "2026-09-01" }, { id: "2026-09-02" }],
  centerInfoMap: {
    "3": { centerName: "Cult HSR 19th Main", isNew: false },
    "220": { centerName: "Cult HSR 24th Main ", isNew: false },
    "267": { centerName: "Cult HSR 14th Main", isNew: false },
  },
  timeSlotOptions: [
    { slot: "morning", icon: "morning", displayText: "Morning", startTime: "06:00:00" },
    { slot: "evening", icon: "evening", displayText: "Evening", startTime: "16:00:00" },
  ],
  classByDateMap: {
    "2026-09-01": {
      id: "2026-09-01",
      classByTimeList: [
        {
          id: "07:00:00",
          isLive: false,
          centerWiseClasses: [
            {
              centerId: 3,
              classes: [
                {
                  id: "1001",
                  workoutId: 69,
                  workoutName: "HRX WORKOUT",
                  startTime: "07:00:00",
                  endTime: "07:50:00",
                  centerID: 3,
                  availableSeats: 8,
                  state: "AVAILABLE",
                },
              ],
            },
            {
              centerId: 220,
              classes: [
                {
                  id: "1002",
                  workoutId: 12,
                  workoutName: "YOGA",
                  startTime: "07:00:00",
                  endTime: "07:50:00",
                  centerID: 220,
                  availableSeats: 0,
                  state: "WAITLIST_AVAILABLE",
                  waitlistInfo: { waitlistedUserCount: 3 },
                },
              ],
            },
          ],
        },
        {
          id: "08:00:00",
          isLive: false,
          centerWiseClasses: [
            {
              centerId: 3,
              classes: [
                {
                  id: "1003",
                  workoutId: 12,
                  workoutName: "YOGA",
                  startTime: "08:00:00",
                  endTime: "08:50:00",
                  centerID: 3,
                  availableSeats: 0,
                  state: "SEAT_NOT_AVAILABLE",
                },
                {
                  id: "1004",
                  workoutId: 69,
                  workoutName: "HRX WORKOUT",
                  startTime: "08:00:00",
                  endTime: "08:50:00",
                  centerID: 3,
                  availableSeats: 5,
                  state: "AVAILABLE",
                },
              ],
            },
            {
              centerId: 267,
              classes: [
                {
                  id: "1005",
                  workoutId: 30,
                  workoutName: "DANCE FITNESS",
                  startTime: "08:00:00",
                  endTime: "08:50:00",
                  centerID: 267,
                  availableSeats: 0,
                  state: "WAITLIST_FULL",
                  waitlistInfo: { waitlistedUserCount: 10 },
                },
              ],
            },
          ],
        },
        {
          id: "18:00:00",
          isLive: false,
          centerWiseClasses: [
            {
              centerId: 220,
              classes: [
                {
                  id: "1006",
                  workoutId: 69,
                  workoutName: "HRX WORKOUT",
                  startTime: "18:00:00",
                  endTime: "18:50:00",
                  centerID: 220,
                  availableSeats: 14,
                  state: "AVAILABLE",
                },
              ],
            },
          ],
        },
      ],
    },
    "2026-09-02": {
      id: "2026-09-02",
      classByTimeList: [
        {
          id: "07:00:00",
          isLive: false,
          centerWiseClasses: [
            {
              centerId: 3,
              classes: [
                {
                  id: "2001",
                  workoutId: 69,
                  workoutName: "HRX WORKOUT",
                  startTime: "07:00:00",
                  endTime: "07:50:00",
                  centerID: 3,
                  availableSeats: 0,
                  state: "BOOKED",
                  isBooked: true,
                },
              ],
            },
          ],
        },
        {
          id: "08:00:00",
          isLive: false,
          centerWiseClasses: [
            {
              centerId: 3,
              classes: [
                {
                  id: "2002",
                  workoutId: 12,
                  workoutName: "YOGA",
                  startTime: "08:00:00",
                  endTime: "08:50:00",
                  centerID: 3,
                  availableSeats: 6,
                  state: "AVAILABLE",
                },
              ],
            },
          ],
        },
      ],
    },
  },
};
