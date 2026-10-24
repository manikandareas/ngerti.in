import React from 'react';
const getToken = async () => null;
export const useAuth = () => ({ getToken, userId: 'acceptance-owner', isLoaded: true, isSignedIn: true });
export const useUser = () => ({ isSignedIn: true });
export const UserButton = () => <span>Acceptance account</span>;
