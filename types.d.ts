declare global {
    type Env = {
        Target?: string;
        BaseURL?: string;
        DisableProxyAuth?: string;
        DisablePrefixRoute?: string;
    };

    type Table = Record<string, string | undefined | null>;
}

export {};
