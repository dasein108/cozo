function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(fn, retries = 3, delayDuration = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error; // If it's the last retry, throw the error
      await delay(delayDuration);
    }
  }
}

export { retry, delay };
