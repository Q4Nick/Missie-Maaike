export type Grid=number[];
const shuffle=<T,>(a:T[])=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b};
export function peers(i:number){const r=Math.floor(i/9),c=i%9,bx=r-r%3,by=c-c%3,out:number[]=[];for(let k=0;k<9;k++){out.push(r*9+k,k*9+c,(bx+Math.floor(k/3))*9+by+k%3)}return out.filter(x=>x!==i)}
const fits=(g:Grid,i:number,n:number)=>peers(i).every(p=>g[p]!==n);
function fill(g:Grid):boolean{const i=g.indexOf(0);if(i<0)return true;for(const n of shuffle([1,2,3,4,5,6,7,8,9])){if(fits(g,i,n)){g[i]=n;if(fill(g))return true;g[i]=0}}return false}
// Telt oplossingen tot `max`; kiest steeds het vakje met de minste kandidaten zodat dit snel blijft.
function count(g:Grid,max=2):number{let best=-1,cands:number[]=[];for(let i=0;i<81;i++){if(g[i])continue;const c=[1,2,3,4,5,6,7,8,9].filter(n=>fits(g,i,n));if(best<0||c.length<cands.length){best=i;cands=c;if(!c.length)return 0}}if(best<0)return 1;let t=0;for(const n of cands){g[best]=n;t+=count(g,max-t);g[best]=0;if(t>=max)break}return t}
export function newSudoku(clues=34){const solution:Grid=Array(81).fill(0);fill(solution);const puzzle=[...solution];let left=81;for(const i of shuffle(Array.from({length:81},(_,k)=>k))){if(left<=clues)break;const keep=puzzle[i];puzzle[i]=0;if(count([...puzzle])===1)left--;else puzzle[i]=keep}return {puzzle,solution}}
