// The app's card surface. A plain module (no "use client"), so server
// components can use the class string too: a value imported from a client
// module reaches a server component as a client reference, not the string.
export const CARD = "rounded-[22px] border-[1.5px] border-line bg-surface-raised p-5";
