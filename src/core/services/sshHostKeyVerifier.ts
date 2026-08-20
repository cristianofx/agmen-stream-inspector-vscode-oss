export interface VerifySshHostKeyOptions {
    profileId: string;
    host: string;
    port: number;
    fingerprint: string;
    getStoredFingerprint(profileId: string): Promise<string | undefined>;
    persistFingerprint(profileId: string, fingerprint: string): Promise<void>;
    confirmFingerprint(details: { host: string; port: number; fingerprint: string }): Promise<boolean>;
}

export interface VerifySshHostKeyResult {
    accepted: boolean;
    reason: 'trusted' | 'untrusted' | 'mismatch';
}

export async function verifySshHostKey(
    options: VerifySshHostKeyOptions,
): Promise<VerifySshHostKeyResult> {
    const stored = await options.getStoredFingerprint(options.profileId);
    if (!stored) {
        const confirmed = await options.confirmFingerprint({
            host: options.host,
            port: options.port,
            fingerprint: options.fingerprint,
        });
        if (!confirmed) {
            return { accepted: false, reason: 'untrusted' };
        }

        await options.persistFingerprint(options.profileId, options.fingerprint);
        return { accepted: true, reason: 'trusted' };
    }

    if (stored !== options.fingerprint) {
        return { accepted: false, reason: 'mismatch' };
    }

    return { accepted: true, reason: 'trusted' };
}
