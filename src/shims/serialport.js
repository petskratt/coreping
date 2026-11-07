// Browser builds never open a serial port. The alias exists so a stray
// import of meshcore's Node entry cannot pull in the native serialport package.
export class SerialPort {
  constructor() {
    throw new Error('Serial is not available in this page. Connect over Bluetooth.');
  }
}
