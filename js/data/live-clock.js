'use strict';
(function(root){
  function snapshot(clock,now){
    var c=clock||{},extra=c.running?Math.max(0,now-c.startedAt):0;
    var remaining=Math.max(0,(Number(c.remaining)||0)-extra),played=(Number(c.played)||0)+extra;
    var nextBreak=Number(c.nextBreak)||Number(c.breakMinutes||60)*60000;
    return {remaining:remaining,played:played,levelDue:remaining===0,breakDue:played>=nextBreak,bb:Number(c.bigBlind)>0?Math.round(Number(c.chips||0)/c.bigBlind*10)/10:null};
  }
  function settle(clock,now){var s=snapshot(clock,now);return Object.assign({},clock,{remaining:s.remaining,played:s.played,startedAt:now});}
  var api={snapshot:snapshot,settle:settle};if(typeof module!=='undefined')module.exports=api;if(root)root.PokerHQLiveClock=api;
})(typeof window!=='undefined'?window:null);
