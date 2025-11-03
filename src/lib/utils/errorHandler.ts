// Global error handler for unhandled promise rejections
// This prevents API key errors from crashing the server

if (typeof process !== 'undefined') {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    // Check if it's an API key error
    if (
      reason?.message?.includes('API key not valid') ||
      reason?.message?.includes('API_KEY_INVALID') ||
      reason?.errorDetails?.some?.((detail: any) =>
        detail?.reason === 'API_KEY_INVALID'
      )
    ) {
      console.error(
        '⚠️ Unhandled API key error:',
        reason.message || 'Invalid API key'
      );
      console.error(
        '⚠️ Please check your config.toml file and ensure you have a valid API key.'
      );
      return; // Don't crash, just log
    }

    // Log other unhandled rejections but don't crash
    console.error('Unhandled Promise Rejection:', reason);
  });
}

export {};
