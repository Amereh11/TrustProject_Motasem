/* TrustProject_Motasem — Pepper tutoring study; same interface in preview and live sessions. */
(() => {
  'use strict';
  const preview = window.PEPPER_PREVIEW === true;
  // A researcher controls the condition; participants never choose it in recorded sessions.
  // In preview.html the researcher can choose either condition without saving data.
  const idMatch = !preview && String(window.uniqueId || '').match(/(?:^|:)debugP([01])[a-f0-9]+(?=:|$)/);
  const rawCondition = preview ? null : (idMatch ? idMatch[1] : null);
  let condition = rawCondition === '0' ? 0 : rawCondition === '1' ? 1 : null;
  const app = document.querySelector('#app');
  const p = !preview && typeof window.PsiTurk === 'function'
    ? new window.PsiTurk(window.uniqueId, window.adServerLoc, window.mode) : null;
  const mediaSources = `<source src="static/media/pepper_loop.mp4" type="video/mp4">`;
  const quiz = [
    [17,24,408],[13,18,234],[16,19,304],[22,14,308],[27,12,324],
    [18,23,414],[24,16,384],[15,27,405],[19,26,494],[32,13,416],
    [14,29,406],[21,17,357],[28,15,420],[23,18,414],[26,17,442]
  ].map(([a,b,correct],i)=>{
    // Phase 1 (1–5): zero errors. Phase 2 (6–10): error on Q8.
    // Phase 3 (11–15): error on Q13. Both groups see identical questions/advice.
    const wrong=[7,12].includes(i),rotation=i%3;
    const opts=[correct-10,correct,correct+10];
    return {n:i+1,a,b,correct,wrong,
      options:[...opts.slice(rotation),...opts.slice(0,rotation)],
      robot:wrong?correct-10:correct};
  });
  const state = {
    idx:0,phase:'',startedAt:Date.now(),clockMs:0,clockSince:null,clockId:null,
    pending:false,ended:false,completed:0,correct:0,
    videoReady:false,videoError:false,responseAt:0,
    lastCheckpoint:''
  };
  const $=s=>document.querySelector(s);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');
  const elapsed=()=>state.clockMs+(state.clockSince===null?0:performance.now()-state.clockSince);
  const time=ms=>`${pad(Math.floor(ms/60000))}:${pad(Math.floor(ms/1000)%60)}`;
  const worked=q=>`${q.a} × ${q.b} = ${q.a} × (${Math.floor(q.b/10)*10} + ${q.b%10}) = ${q.a*Math.floor(q.b/10)*10} + ${q.a*(q.b%10)} = ${q.correct}.`;
  const button=(label,id,cls='')=>`<button type="button" class="button ${cls}" data-action="${esc(id)}">${esc(label)}</button>`;
  const click=(id,fn)=>{const el=$(`[data-action="${id}"]`);if(el)el.addEventListener('click',fn);};
  function put(k,v){if(p)p.recordUnstructuredData(k,v);}
  function clockDisplay(){const el=$('#stopwatch');if(el)el.textContent=time(elapsed());}
  function pauseClock(){
    if(state.clockSince!==null){state.clockMs=elapsed();state.clockSince=null;}
    if(state.clockId!==null){clearInterval(state.clockId);state.clockId=null;}
    clockDisplay();
  }
  function resumeClock(){
    if(state.ended||state.pending||state.clockSince!==null)return;
    state.clockSince=performance.now();
    state.clockId=setInterval(clockDisplay,250);clockDisplay();
  }
  function save(checkpoint,next){
    if(state.pending)return;
    pauseClock();
    if(preview){state.lastCheckpoint=checkpoint;if(next)next();return;}
    if(!p){saveError(checkpoint,next,'The experiment is not connected to psiTurk. Contact your researcher.');return;}
    state.pending=true;
    put('last_checkpoint',checkpoint);
    document.querySelectorAll('button').forEach(b=>b.disabled=true);
    const notice=$('#save-message');if(notice)notice.textContent='Saving answers…';
    const success=()=>{state.pending=false;state.lastCheckpoint=checkpoint;if(next)next();};
    const error=()=>{state.pending=false;saveError(checkpoint,next,'Could not save your answers. Check your connection, then try again.');};
    try{p.saveData({success,error});}catch(_){error();}
  }
  function saveError(checkpoint,next,message){
    pauseClock();
    let notice=$('#save-message');
    if(!notice){const host=$('#study-content');if(!host)return;notice=document.createElement('div');notice.id='save-message';host.appendChild(notice);}
    notice.innerHTML=`<span role="alert">${esc(message)}</span> ${button('Retry saving','retry-save','primary')}`;
    click('retry-save',()=>save(checkpoint,next));
  }
  function shell(){
    app.innerHTML=`<main class="study" id="study">
      <header class="topbar"><span class="wordmark"><span class="mark">P</span> Pepper <span class="wordmark-divider">/</span> Math Tutor Study</span>
      <span id="top-status" class="top-status">Research study</span></header>
      <section class="workarea"><section class="content" id="content-pane" aria-live="polite">
        <p class="eyebrow" id="stage"></p><h1 id="title"></h1><p class="subheading" id="subtitle"></p>
        <div id="study-content"></div><div id="save-message" class="save-message" role="status"></div>
      </section><aside class="aside" id="aside"><div id="example-panel" class="example-panel"></div>
        <div id="media-panel" class="media-panel" hidden><div class="video-box">
          <video id="robot-video" muted autoplay loop playsinline preload="auto" aria-label="Robot video shown during the study">${mediaSources}</video>
          <div id="media-fallback" class="media-fallback" hidden>Video not available.</div>
        </div><p id="media-caption" class="side-label">Robot video</p><div class="speech-card" id="speech-card" hidden><span>Pepper says</span><p id="robot-speech"></p></div></div>
      </aside></section><footer class="footer"><span>Human–robot interaction study</span><span>${preview ? "PREVIEW · Nothing is recorded" : "RECORDED SESSION · Local psiTurk"}</span></footer></main>`;
    const v=$('#robot-video');
    v.addEventListener('playing',()=>{
      state.videoReady=true;state.videoError=false;$('#media-fallback').hidden=true;
      if(preview)$('#media-caption').textContent='Pepper video · Preview only';
      updateVideoCheck();
    });
    v.addEventListener('error',()=>{
      state.videoReady=false;state.videoError=true;$('#media-fallback').hidden=false;
      put('video_error',1);updateVideoCheck();
    });
  }
  function layout(stage,title,subtitle,body,side='neutral',speech=''){
    pauseClock();state.phase=stage;
    $('#stage').textContent=({'initial':'Math question · Your answer','suggestion':'Math question · Pepper’s suggestion'}[stage]||stage);
    $('#title').textContent=title;
    const sub=$('#subtitle');sub.textContent=subtitle||'';sub.hidden=!subtitle;
    $('#study-content').innerHTML=body;$('#save-message').innerHTML='';
    $('#top-status').innerHTML=['initial','suggestion'].includes(stage)
      ? `<span class="timer">Math time <strong id="stopwatch">${time(elapsed())}</strong></span> <span class="progress">${state.completed} / 15 done</span>`
      :'Research study';
    const isVideo=['video','initial','suggestion','correction'].includes(side);
    $('#media-panel').hidden=!isVideo;$('#example-panel').hidden=isVideo;
    if(isVideo){
      $('#speech-card').hidden=side==='video'||stage==='Answer feedback';
      $('#robot-speech').textContent=speech;
      $('#media-caption').textContent=preview?'Video · Preview only':'Pepper · Robot tutor';
      const v=$('#robot-video');v.play().catch(()=>{});
    }else{
      const path={step1:'instruction_initial.png',step2:'instruction_recommendation.png',step3:'instruction_feedback.png',step4:'instruction_trust.png'}[side];
      $('#example-panel').innerHTML=path
        ? `<p class="side-label">Example screen · What you will see</p><img class="example-image" src="static/media/${path}" alt="Example of the study screen"><p class="side-small">Example only. Real questions start after the instructions.</p>`
        : `<div class="neutral-icon">✓</div><p class="neutral-label">Robot Math Study</p><p class="neutral-note">Please follow the instructions on the left.</p>`;
    }
    clockDisplay();
  }
  function start(){
    if(!app)return;
    if(preview && condition===null){
      app.innerHTML=`<main class="preview-start"><h1>Pepper Math Tutor Study</h1>
        <p>Researcher preview. Both versions use the exact same study screens as the recorded server, but <strong>no data is saved</strong>.</p>
        <div class="preview-choices"><button class="button primary" data-action="choose-0">Preview 0 · Correction only</button>
          <button class="button primary" data-action="choose-1">Preview 1 · Apology + correction</button></div>
        <p>For actual data collection, start the psiTurk server and use <strong>http://127.0.0.1:22362/study</strong>.</p></main>`;
      click('choose-0',()=>{condition=0;start();});
      click('choose-1',()=>{condition=1;start();});
      return;
    }
    if(condition===null){app.textContent='Open recorded sessions at http://127.0.0.1:22362/study. Do not use /exp directly.';return;}
    shell();put('study_version','4.0.0');put('condition',condition);
    put('completed',0);put('questions_completed',0);showConsent();
  }
  function showConsent(){
    layout('Consent','Before you begin','Read this page and decide if you want to join.',`
      <div class="simple-card consent-card"><p><strong>Study:</strong> Pepper is a robot math tutor. We want to learn how people respond to his advice.</p>
      <p><strong>Risks:</strong> Some questions might be frustrating. You can stop at any time.</p>
      <p><strong>Benefits:</strong> You may not benefit directly. Your answers may help us improve robot learning tools.</p>
      <p><strong>Privacy:</strong> We do not ask for names or emails. Answers and a study ID are stored on the researcher's computer. The server can keep technical logs.</p>
      <p><strong>Your choice:</strong> Joining is voluntary. If you are under 18, participate only after the researcher has arranged the permission and assent required by the school or research ethics review.</p></div>
      <label class="check-row"><input type="checkbox" id="consent-check"> I read this information and agree to take part.</label>
      ${button('I agree — continue','consent-next','primary')} ${button('I do not agree','decline')}`);
    $('[data-action="consent-next"]').disabled=true;
    $('#consent-check').addEventListener('change',e=>{$('[data-action="consent-next"]').disabled=!e.target.checked;});
    click('decline',()=>{layout('Exit','You chose not to take part','','<p>No study questions will be shown. You can close this page.</p>');});
    click('consent-next',()=>{put('consent',1);save('consent',showDemographics);});
  }
  function field(label,name,choices){
    return `<label class="field"><span>${esc(label)}</span><select name="${name}" required><option value="">Select one</option>${choices.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>`;
  }
  function showDemographics(){
    layout('Demographics','A few questions about you','Choose one answer for each question.',`
      <form id="demographics" class="form-grid">
      ${field('Age range','age_range',[['11-14','11–14'],['15-18','15–18'],['19-24','19–24'],['25-34','25–34'],['35-44','35–44'],['45-54','45–54'],['55-64','55–64'],['65-74','65–74'],['75+','75 or older'],['prefer_not','Prefer not to say']])}
      ${field('Gender','gender',[['woman','Woman'],['man','Man'],['nonbinary','Nonbinary'],['self_describe','Another identity'],['prefer_not','Prefer not to say']])}
      ${field('Have you done an online research study before?','study_experience',[['yes','Yes'],['no','No'],['unsure','Not sure'],['prefer_not','Prefer not to say']])}
      ${field('How much experience do you have with robots?','robot_experience',[['none','None'],['little','A little'],['some','Some'],['a_lot','A lot'],['prefer_not','Prefer not to say']])}
      <div class="form-actions"><p id="form-error" role="status" class="validation"></p><button class="button primary" type="submit">Continue</button></div></form>`);
    $('#demographics').addEventListener('submit',e=>{
      e.preventDefault();const form=new FormData(e.currentTarget);
      const names=['age_range','gender','study_experience','robot_experience'];
      if(names.some(n=>!form.get(n))){$('#form-error').textContent='Please answer all four questions.';return;}
      names.forEach(n=>put(n,form.get(n)));save('demographics',showVideoCheck);
    });
  }
  function updateVideoCheck(){
    if(state.phase!=='Video check')return;
    const status=$('#video-status'),yes=$('[data-action="video-yes"]');if(!status||!yes)return;
    status.textContent=state.videoReady?'Video is playing. Can you see it move?':state.videoError?'Video could not load. Please tell your researcher.':'Checking the video…';
    yes.disabled=!state.videoReady;
  }
  function showVideoCheck(){
    layout('Video check','Make sure the video works','Check that the robot video is moving.',`
      <div class="simple-card"><p>This is Pepper, your robot math tutor.</p><p>Make sure you can see the video move, then select <strong>Yes, it works</strong>.</p></div>
      <p class="status-text" id="video-status">Checking the video…</p>
      ${button('Yes, it works','video-yes','primary')} ${button('Try playing again','video-retry')}`,'video');
    click('video-retry',()=>{const v=$('#robot-video');v.load();v.play().catch(()=>updateVideoCheck());});
    click('video-yes',()=>{if(!state.videoReady)return;put('video_confirmed',1);save('video_check',showInstruction1);});
    updateVideoCheck();
  }
  function showInstruction1(){
    layout('Instructions · 1 of 4','Pepper will give you math questions','Pepper is your tutor during the study.',`
      <div class="simple-card"><p><strong>Pepper:</strong> “Hi! I'm Pepper, your robot math tutor. I'll give you 15 multiplication questions and help you check your work.”</p>
      <p>First, choose your own answer. Then Pepper will suggest an answer.</p>
      <p>Please do not use a calculator, notes, or someone else's help.</p></div>
      ${button('Next instruction','next1','primary')}`,'step1');click('next1',showInstruction2);
  }
  function showInstruction2(){
    layout('Instructions · 2 of 4','Next, see Pepper’s suggestion','You decide which answer is best.',`
      <div class="simple-card"><p><strong>Pepper:</strong> “I'll tell you which answer I suggest. You can agree with me or choose another answer.”</p>
      <p>Then select your <strong>final answer</strong>. Pepper can sometimes make mistakes.</p></div>
      ${button('Next instruction','next2','primary')}`,'step2');click('next2',showInstruction3);
  }
  function showInstruction3(){
    layout('Instructions · 3 of 4','Find out if you were right','You get feedback after every question.',`
      <div class="simple-card"><p><strong>Pepper:</strong> “After you answer, I'll show the correct answer and explain one way to work it out.”</p>
      <p>You will find out whether your final answer was right or wrong.</p>
      <p>If Pepper suggests a wrong answer, he'll correct it.</p></div>
      ${button('Next instruction','next3','primary')}`,'step3');click('next3',showInstruction4);
  }
  function showInstruction4(){
    layout('Instructions · 4 of 4','Time and trust ratings','There are 15 math questions.',`
      <div class="simple-card"><p>There are <strong>3 rounds of 5 questions</strong>. After each round, you will rate how much you trust Pepper's advice.</p>
      <p>The clock counts up, not down. You have <strong>no time limit</strong>.</p>
      <p>Take the time you need. The clock pauses during feedback and ratings.</p></div>
      ${button('Start math questions','begin','primary')}`,'step4');click('begin',showInitial);
  }
  function answerButtons(q,phase){return `<div class="answer-grid">${q.options.map(n=>button(n,`${phase}-${n}`,'choice')).join('')}</div>`;}
  function recordTrial(row){
    // One small JSON value per question; updating this value preserves partial answers.
    put(`q${row.n}`,JSON.stringify(row));
  }
  function showInitial(){
    if(state.idx>=quiz.length){showFinalCheck();return;}
    const q=quiz[state.idx];
    layout('initial',`Question ${q.n} of 15`,`Round ${Math.ceil(q.n/5)} of 3 · Choose your own answer first.`,`
      <div class="math-card"><span>What is the answer?</span><strong>${q.a} × ${q.b} = ?</strong></div>
      ${answerButtons(q,'initial')}<p class="hint">Choose one answer to see Pepper’s suggestion.</p>`,'initial','Try this question on your own first.');
    state.responseAt=performance.now();resumeClock();
    for(const n of q.options)click(`initial-${n}`,()=>{
      if(state.clockSince===null||state.pending)return;
      const rt=Math.round(performance.now()-state.responseAt);pauseClock();
      const row={n:q.n,a:q.a,b:q.b,correct:q.correct,robot:q.robot,initial:n,initial_ms:rt};
      recordTrial(row);save(`q${q.n}_initial`,()=>showSuggestion(row));
    });
  }
  function showSuggestion(row){
    const q=quiz[state.idx];
    layout('suggestion',`Question ${q.n} of 15`,'Pepper is helping you decide. Choose your final answer.',`
      <div class="two-answers"><div><small>Your first answer</small><strong>${row.initial}</strong></div>
        <div class="pepper-answer"><small>Pepper suggests</small><strong>${q.robot}</strong></div></div>
      <p class="answer-heading">What is your <strong>final answer</strong>?</p>${answerButtons(q,'final')}
      <p class="hint">You can agree or disagree with Pepper.</p>`,'suggestion',`My suggested answer is ${q.robot}. What do you think? You decide.`);
    state.responseAt=performance.now();resumeClock();
    for(const n of q.options)click(`final-${n}`,()=>{
      if(state.clockSince===null||state.pending)return;
      pauseClock();row.final=n;row.final_ms=Math.round(performance.now()-state.responseAt);
      row.feedback_seen=false;recordTrial(row);
      state.completed++;state.correct+=+(n===q.correct);
      put('questions_completed',state.completed);put('math_time_ms',Math.round(elapsed()));
      save(`q${q.n}_final`,()=>showFeedback(q,row));
    });
  }
  function showFeedback(q,row){
    const right=row.final===q.correct;
    const explanation=worked(q);
    // The worked math is identical in both groups. The treatment is how Pepper
    // acknowledges and responds to the two incorrect suggestions.
    const correction=q.wrong
      ? (condition===1
        ? `I'm sorry. I made a mistake when I suggested ${q.robot}. That was my error, and I know wrong advice can be confusing. The right answer is ${q.correct}. Here's how to check it: ${explanation} I'll check my steps more carefully next time.`
        : `My suggestion of ${q.robot} was incorrect. The correct answer is ${q.correct}. Here's how to check it: ${explanation}`)
      : `The correct answer is ${q.correct}. Here's how to check it: ${explanation}`;
    layout('Answer feedback',right?'Correct!':'Not quite',`Pepper's explanation for question ${q.n}.`,`
      <div class="simple-card ${right?'feedback-right':'feedback-wrong'}">
        <p><strong>Your final answer:</strong> ${row.final} · <strong>Correct answer:</strong> ${q.correct}</p>
        <p><strong>${right?'You got it right.':'Your answer was incorrect.'}</strong></p></div>
      <div class="simple-card feedback-robot"><strong>Pepper says:</strong>
        <p>${esc(correction)}</p></div>
      ${button('Continue','feedback-next','primary')}`,
      'correction',correction);
    click('feedback-next',()=>{row.feedback_seen=true;recordTrial(row);save(`q${q.n}_feedback`,advance);});
  }
  function advance(){
    state.idx++;
    if(state.completed%5===0)showTrust(state.completed/5);
    else showInitial();
  }
  function likert(name,label){
    return `<fieldset class="rating"><legend>${esc(label)}</legend><div class="rating-options">${[1,2,3,4,5,6,7].map(n=>`<label><input type="radio" name="${name}" value="${n}" required><span>${n}</span></label>`).join('')}</div>
    <div class="endpoints"><span>Not at all</span><span>Very much</span></div></fieldset>`;
  }
  function showTrust(block){
    layout('Trust rating',`After round ${block} of 3`,'Think about Pepper as your math tutor in the questions you just finished.',`
      <form id="trust-form" class="trust-form">${likert('trust','How much do you trust Pepper’s math suggestions?')}
      ${likert('reliable','How reliable is Pepper as a math helper?')}
      <p id="trust-error" class="validation" role="status"></p>
      <button class="button primary" type="submit">${state.completed===15?'Finish ratings':'Continue to math'}</button></form>`);
    $('#trust-form').addEventListener('submit',e=>{
      e.preventDefault();const f=new FormData(e.currentTarget);
      if(!f.has('trust')||!f.has('reliable')){$('#trust-error').textContent='Please answer both ratings.';return;}
      const record={after:state.completed,trust:Number(f.get('trust')),reliability:Number(f.get('reliable'))};
      put(`trust_${block}`,JSON.stringify(record));
      save(`trust_${block}`,()=>state.completed===15?showFinalCheck():showInitial());
    });
  }
  function showFinalCheck(){
    layout('Final question','One last question','Think about what Pepper said during the study.',`
      <form id="final-form"><fieldset class="rating"><legend>Did Pepper say “I’m sorry” after giving a wrong answer?</legend>
      <div class="inline-radio"><label><input type="radio" name="apology_noticed" value="yes" required> Yes</label>
      <label><input type="radio" name="apology_noticed" value="no"> No</label>
      <label><input type="radio" name="apology_noticed" value="unsure"> Not sure</label></div></fieldset>
      <button class="button primary" type="submit">Submit study answers</button></form>`);
    $('#final-form').addEventListener('submit',e=>{
      e.preventDefault();const v=new FormData(e.currentTarget).get('apology_noticed');if(!v)return;
      put('apology_noticed',v);put('math_time_ms',Math.round(elapsed()));
      put('total_elapsed_ms',Date.now()-state.startedAt);put('completed',1);state.ended=true;
      layout('Saving','Saving your answers','Please do not close this page until saving finishes.','<p>Finishing your study record…</p>');
      save('study_complete',showComplete);
    });
  }
  function showComplete(){
    layout('Complete','Thank you for taking part!',preview
      ? 'Preview finished. No answers were saved.'
      : 'Your answers have been saved to the study database.',`
      <div class="simple-card"><p>You finished <strong>${state.completed}</strong> of 15 math questions and got <strong>${state.correct}</strong> final answers correct.</p>
      <p><strong>About the study:</strong> Pepper intentionally made two mistakes. We are studying whether his response to errors changes trust. This was not a test of your ability.</p></div>
      ${preview ? '' : button('Return to researcher page','next-participant','primary')}`);
    if(!preview)click('next-participant',()=>{window.location.assign('/study');});
  }
  document.addEventListener('DOMContentLoaded',start);
})();
