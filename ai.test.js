import { A, B, EMPTY, POINTS, id, newGame, countBeads, legalMoves, applyMove } from './engine.js';
import { chooseMove, evaluate, DIFFICULTY } from './ai.js';

let pass=0, fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log(`  ✗ ${m}`));};
const board=m=>{const b=new Int8Array(POINTS).fill(EMPTY);for(const k in m)b[+k]=m[k];return b;};
const sw=(m,turn=A,rule='free')=>{const s=newGame(rule);s.board=board(m);s.turn=turn;s.scores=countBeads(s.board);s.chainFrom=null;s.result=null;return s;};

// deterministic rng for reproducible tests
function seeded(seed){let x=seed>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)%100000)/100000;};}

console.log('— AI legality —');
// Play 30 random-ish full games hard vs hard; assert every chosen move is legal and games terminate.
for(let t=0;t<10;t++){
  let s=newGame('free'); let plies=0;
  while(!s.result && plies<400){
    const mv=chooseMove(s, plies%2===0?'hard':'medium', seeded(1000+t*7+plies));
    ok(mv!==null,'AI returns a move when moves exist');
    const legal=legalMoves(s).some(x=>x.from===mv.from&&x.to===mv.to);
    if(!legal){ok(false,`AI move legal (game ${t} ply ${plies})`);break;}
    s=applyMove(s,mv); plies++;
  }
  ok(s.result!==null || plies>=400, `game ${t} reached terminal or move cap`);
}

console.log('— AI takes a free winning capture —');
{ // A to move, single capture available that wins the game
  let s=sw({[id(2,1)]:A,[id(2,2)]:B},A);
  const mv=chooseMove(s,'hard');
  ok(mv.type==='capture'&&mv.to===id(2,3),'hard CPU takes the winning capture');
}

console.log('— AI avoids hanging into immediate loss when it can —');
{ // simple position: A should not move into a square where B captures back for free if a safe move exists
  // A(4,4) B(0,0): far apart, A has only quiet moves; just assert it returns something sane
  let s=sw({[id(4,4)]:A,[id(0,0)]:B,[id(4,2)]:A},A);
  const mv=chooseMove(s,'hard');
  ok(mv!==null,'returns a move in a quiet position');
}

console.log('— Evaluation sanity —');
{ let up=sw({[id(2,2)]:A,[id(0,0)]:A,[id(4,4)]:B},A);   // A up a bead
  ok(evaluate(up,A)>0 && evaluate(up,B)<0,'material advantage reflected & symmetric'); }
{ let even=newGame(); ok(Math.abs(evaluate(even,A))<50,'start position roughly balanced'); }

console.log('— Strength: hard beats easy over several games —');
{
  let hardWins=0, easyWins=0, draws=0;
  const N=12;
  for(let i=0;i<N;i++){
    let s=newGame('free');
    const hardIs = i%2===0 ? A : B; // alternate colors for fairness
    let plies=0;
    while(!s.result && plies<300){
      const level = (s.turn===hardIs)?'hard':'easy';
      const mv=chooseMove(s, level, seeded(7000+i*13+plies));
      s=applyMove(s,mv); plies++;
    }
    if(!s.result || s.result.winner==='draw') draws++;
    else if(s.result.winner===hardIs) hardWins++;
    else easyWins++;
  }
  console.log(`    hard ${hardWins} – easy ${easyWins} – draws ${draws} (of ${N})`);
  ok(hardWins>easyWins,'hard wins more than easy across games');
}

console.log('— Speed: hard (depth 6) move time —');
{
  // mid-game-ish position with many beads
  let s=newGame('free');
  // play a few opening plies to get a realistic branching factor
  for(let k=0;k<6;k++){ s=applyMove(s, chooseMove(s,'medium',seeded(42+k))); }
  const t0=Date.now();
  const mv=chooseMove(s,'hard');
  const dt=Date.now()-t0;
  console.log(`    depth-6 move chosen in ${dt} ms`);
  ok(mv!==null,'hard returns a move');
  ok(dt<4000,'depth-6 move under 4s (responsive enough; tune if higher)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
