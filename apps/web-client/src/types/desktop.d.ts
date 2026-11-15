export {};

declare global {
  interface Window {
    ngertiinDesktop?: {
      platform: string;
      nativeVisibility?: boolean;
      remote?: boolean;
      signIn?(): Promise<void>;
      cancelSignIn?(): Promise<void>;
      openExternal?(url: string): Promise<void>;
      reportComputerView(active: boolean, revision: number): void;
      onVisibility(callback: (visible: boolean) => void): () => void;
    };
  }
}
