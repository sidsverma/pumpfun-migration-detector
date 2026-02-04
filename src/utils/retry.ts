/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries?: number;
        baseDelayMs?: number;
        maxDelayMs?: number;
    } = {}
): Promise<T> {
    const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = options;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            if (attempt === maxRetries) {
                break;
            }

            // Check for rate limiting
            const isRateLimited =
                lastError.message?.includes('429') ||
                lastError.message?.includes('rate limit') ||
                lastError.message?.includes('Too Many Requests');

            const delay = Math.min(
                baseDelayMs * Math.pow(2, attempt) * (isRateLimited ? 2 : 1),
                maxDelayMs
            );

            console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
            await sleep(delay);
        }
    }

    throw lastError;
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run promises with concurrency limit
 */
export async function withConcurrencyLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = [];
    const executing: Promise<void>[] = [];

    for (const item of items) {
        const p = fn(item).then(result => {
            results.push(result);
        });

        executing.push(p as Promise<void>);

        if (executing.length >= limit) {
            await Promise.race(executing);
            // Remove completed promises
            for (let i = executing.length - 1; i >= 0; i--) {
                const status = await Promise.race([
                    executing[i].then(() => 'resolved'),
                    Promise.resolve('pending')
                ]);
                if (status === 'resolved') {
                    executing.splice(i, 1);
                }
            }
        }
    }

    await Promise.all(executing);
    return results;
}
