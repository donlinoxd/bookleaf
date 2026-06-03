declare module 'nodejs-mobile-react-native' {
  const nodejs: {
    start: (scriptFileName: string) => void;
    channel: {
      send: (message: string) => void;
      addListener: (event: 'message', callback: (message: string) => void) => void;
      removeListener: (event: 'message', callback: (message: string) => void) => void;
    };
  };
  export default nodejs;
}
