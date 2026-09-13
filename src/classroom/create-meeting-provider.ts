import { JitsiMeetingAdapter } from "./jitsi-meeting-adapter";
import type { MeetingProvider } from "./meeting";

export function createMeetingProvider(): MeetingProvider {
  return new JitsiMeetingAdapter();
}
