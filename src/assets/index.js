// src/assets/index.js — CargoChain
// Re-export every PNG in src/assets/ as a named URL string.
// Vite's import.meta.glob with ?url gives us a static, tree-shakable
// import — components can `import { outlineMarketplace } from '../assets'`.

const modules = import.meta.glob('../assets/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

/**
 * Convert a glob key like "./01_logo_brand/logo_text_horizontal.png" (Vite
 * resolves the glob relative to the current file) to a stable identifier
 * like "logoTextHorizontal".
 *
 * Rules:
 *  - drop the leading "./" or "../assets/" prefix
 *  - drop the category folder (e.g. "01_logo_brand/")
 *  - join remaining path parts and camelCase them
 *  - strip the .png extension
 */
function toName(key) {
  // Strip any leading "./" or "../assets/" (or "src/assets/") so we're left
  // with the path inside the assets dir.
  const file = key
    .replace(/^(?:\.\/|.*\/assets\/)/, '')
    .replace(/^src\/assets\//, '');
  const parts = file.split('/').slice(1); // drop the category folder
  const stem = parts.join('/').replace(/\.png$/i, '');
  const camel = stem.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());
  return camel.charAt(0).toLowerCase() + camel.slice(1);
}

const named = Object.fromEntries(
  Object.entries(modules).map(([key, url]) => [toName(key), url])
);

export const {
  // 01 Logo & Brand
  logoTextHorizontal,
  logoMarkOutlineCard,
  logoMarkBlueCard,
  logoMarkDarkCard,

  // 02 Illustrations
  deliveryTruckCity,
  clipboardRouteMap,
  warehouseInventoryBoxes,
  packageHandover,
  workerPackingInventory,
  verificationLaptopUser,

  // 03 Icons (outlined)
  outlineHome,
  outlineMarketplace,
  outlineShipments,
  outlineTrack,
  outlineWallet,
  outlineProfile,
  outlineLogout,
  outlineRoute,
  outlineBox,
  outlineTruck,
  outlineMotorcycle,
  outlineVan,
  outlineLorry,
  outlineClock,
  outlineCalendar,
  outlineMilestone,
  outlineProof,
  outlineCheck,
  outlineLock,
  outlineEscrow,
  outlinePayment,
  outlineUpload,
  outlineFilter,

  // 04 Icons (filled)
  filledHome,
  filledMarketplace,
  filledShipments,
  filledCreate,
  filledTrack,
  filledWallet,
  filledProfile,
  filledLogout,
  filledRoute,
  filledBox,
  filledTruck,
  filledMotorcycle,
  filledVan,
  filledLorry,
  filledClock,
  filledCalendar,
  filledMilestone,
  filledProof,
  filledCheck,
  filledLock,
  filledEscrow,
  filledPayment,
  filledUpload,
  filledFilter,

  // 05 Vehicle icons
  vehicleMotorcycle,
  vehicleVan,
  vehicleLorry,
  vehicleTruck,

  // 06 Status badges
  badgeInTransit,
  badgeAwaitingVerification,
  badgePending,
  badgeCompleted,
  badgeCancelled,
  badgeEscrowFunded,

  // 07 UI elements (reference only — not used directly in components)
  buttonPrimary,
  buttonSecondary,
  textLink,
  chipDefault,
  chipActive,
  chipSuccess,
  chipWarning,
  chipDanger,
  inputField,
  dropdownField,
  searchField,
  pagination,

  // 08 Progress steps (reference only)
  paginationDotsSteps,
  progressBar60,
  stepperFourSteps,

  // 09 Payment / escrow tiles
  escrowFundedTile,
  paymentReleasedTile,
  refundTile,
  lockedTile,

  // 10 Avatars
  avatarShipperMale,
  avatarShipperFemale,
  avatarCarrierDriver,
  avatarPlaceholder,

  // 11 Backgrounds & decorative
  backgroundCitySkyline,
  backgroundSoftMountains,
  backgroundClouds,
  decorativeDotGridLarge,
  decorativeDotGridSmall,
  decorativeCircleBlob,

  // 12 Miscellaneous
  successCircle,
  blueCheckCircle,
  infoCircle,
  warningTriangle,
  errorCircle,
  notificationBell,
  moreHorizontal,
  moreVertical,
  arrowLeft,
  arrowRight,
  eyeView,
  download,
  document,
} = named;

// Also export the raw map for code that needs to iterate (e.g. EmptyState).
export const assetMap = named;
export default named;
