/** One capture owns one completion promise, including auto-stop and asynchronous decoding. */
export class CaptureTurn {
  readonly promise:Promise<string>;
  settled=false;
  private resolve!:(text:string)=>void;
  constructor(readonly version:number) { this.promise=new Promise(resolve=> { this.resolve=resolve; }); }
  complete(text:string):void { if(this.settled) return;this.settled=true;this.resolve(text); }
}
