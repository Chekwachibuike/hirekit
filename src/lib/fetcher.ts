// Shared fetcher for useSWR(url, fetcher) calls against our own /api/* routes.
export const fetcher = (url: string) => fetch(url).then(r => r.json())
