import { parseSession } from "./accessControl";

export const AUTH_SESSION_KEY = "finansu-harmonija-v7:authenticated";

export function userProfileStorageKey(email: string) {
  return `finansu-harmonija:v12:user-profile:${email.trim().toLocaleLowerCase()}`;
}

export function getCurrentUserIdentity() {
  if (typeof window === "undefined") {
    return { fullName: "Unknown user", email: "" };
  }

  try {
    const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
    if (!session) return { fullName: "Unknown user", email: "" };

    const profile = JSON.parse(
      window.localStorage.getItem(userProfileStorageKey(session.email)) ||
        "null",
    ) as { fullName?: string; email?: string } | null;
    const matchingProfile =
      profile?.email?.trim().toLocaleLowerCase() ===
      session.email.trim().toLocaleLowerCase();

    return {
      fullName:
        (matchingProfile ? profile?.fullName?.trim() : "") ||
        session.fullName.trim() ||
        session.email,
      email: session.email,
    };
  } catch {
    return { fullName: "Unknown user", email: "" };
  }
}

export function getCurrentUserName() {
  return getCurrentUserIdentity().fullName;
}
