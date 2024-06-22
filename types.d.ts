declare global {
    interface Env {
        Target: string;
        BaseURL: string;
        DisableProxyAuth: string;
        DisablePrefixRoute: string;
    }
}

export {};
