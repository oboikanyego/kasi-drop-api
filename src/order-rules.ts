/** Pure business rules: safe for unit tests and shared across API handlers. */
export const orderTransitions: Readonly<Record<string,readonly string[]>> = {
 paid:['processing'],demo_paid:['processing'],
 processing:['shipped'],shipped:['delivered']
};
export function canAdvanceOrder(current:string,next:string):boolean {
 return Boolean(orderTransitions[current]?.includes(next));
}
/** Prices are represented in cents for payment calculations; reject fractional cents. */
export function validatePrice(price:number):boolean {
 return Number.isFinite(price)&&price>0&&Number.isSafeInteger(Math.round(price*100))
  && Math.abs(price*100-Math.round(price*100))<1e-6;
}
export function inCents(price:number):number {
 if(!validatePrice(price))throw new Error('Invalid monetary amount');
 return Math.round(price*100);
}
