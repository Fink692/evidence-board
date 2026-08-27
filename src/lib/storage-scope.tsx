import { createContext, useContext } from 'react';

export const StorageScope = createContext<'account' | 'device'>('account');
export const useDeviceStorage = () => useContext(StorageScope) === 'device';
