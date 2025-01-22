import * as shutter from "./encryptDataBlst.js";

// Wait for blst.js to initialize
function ensureBlstInitialized() {
  return new Promise((resolve, reject) => {
    if (window.blst && typeof window.blst.P1 === "function") {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (window.blst && typeof window.blst.P1 === "function") {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);

      // Timeout if blst.js fails to initialize
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error("Failed to initialize blst.js runtime within the timeout."));
      }, 5000); // 5 seconds timeout
    }
  });
}

// Initialize and expose the shutter module
(async () => {
  try {
    await ensureBlstInitialized();
    console.log("blst.js runtime initialized.");
    window.shutter = shutter; // Expose shutter globally after runtime is ready
  } catch (error) {
    console.error("Failed to initialize Shutter/BLST runtime:", error);
  }
})();
