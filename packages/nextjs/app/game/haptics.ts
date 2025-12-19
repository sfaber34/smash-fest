// =============================================
// HAPTIC FEEDBACK - COMMENTED OUT FOR NOW
// =============================================

// // Haptic queue for iOS (Safari requires user gesture to trigger haptics)
// let pendingHaptic: "light" | "medium" | "heavy" | null = null;
//
// // Direct iOS haptic implementation using checkbox switch trick
// export const triggerIOSHaptic = (count: number = 1) => {
//   if (typeof document === "undefined") return;
//
//   const fire = () => {
//     const checkbox = document.createElement("input");
//     checkbox.type = "checkbox";
//     checkbox.setAttribute("switch", "");
//     checkbox.style.position = "fixed";
//     checkbox.style.opacity = "0";
//     checkbox.style.pointerEvents = "none";
//     document.body.appendChild(checkbox);
//     checkbox.click();
//     checkbox.remove();
//   };
//
//   for (let i = 0; i < count; i++) {
//     setTimeout(fire, i * 50);
//   }
// };
//
// // Cross-platform haptic trigger
// export const triggerHapticDirect = (intensity: "light" | "medium" | "heavy" = "medium") => {
//   // Try navigator.vibrate first (Android)
//   if (typeof navigator !== "undefined" && "vibrate" in navigator) {
//     const duration = intensity === "light" ? 10 : intensity === "medium" ? 25 : 50;
//     navigator.vibrate(duration);
//   }
//
//   // Also try iOS checkbox trick
//   const count = intensity === "heavy" ? 3 : intensity === "medium" ? 2 : 1;
//   triggerIOSHaptic(count);
// };
//
// // Queue a haptic to be triggered on next user touch (for iOS Safari compatibility)
// export const queueHaptic = (intensity: "light" | "medium" | "heavy" = "medium") => {
//   // Keep the strongest pending haptic
//   if (!pendingHaptic || intensity === "heavy" || (intensity === "medium" && pendingHaptic === "light")) {
//     pendingHaptic = intensity;
//   }
// };
//
// // Fire pending haptic - call this from user gesture handlers (touch/click)
// export const firePendingHaptic = () => {
//   if (!pendingHaptic) return;
//
//   triggerHapticDirect(pendingHaptic);
//   pendingHaptic = null;
// };
