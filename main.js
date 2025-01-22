import * as shutter from "./encryptDataBlst.js";

(async () => {
  try {
    await shutter.init(); // Assuming encryptDataBlst.js exposes an `init` function to initialize BLST
    console.log("Shutter and BLST runtime initialized.");
    window.shutter = shutter; // Expose shutter globally after initialization
  } catch (error) {
    console.error("Failed to initialize Shutter/BLST runtime:", error);
  }
})();

