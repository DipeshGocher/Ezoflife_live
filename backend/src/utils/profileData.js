export const safeProfile = value => {
    const profile = value.toObject ? value.toObject() : { ...value };
    for (const key of ['password', 'otp', 'otpExpiry', 'activationToken', 'fcmToken']) delete profile[key];
    if (profile.bankVerification) { profile.bankVerification = { ...profile.bankVerification }; delete profile.bankVerification.amount; }
    return profile;
};
