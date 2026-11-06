/* PEPPER_TRUST_STUDY_BUILD_6_2_0 — local psiTurk and non-saving preview. */
(() => {
  'use strict';
  const preview = window.PEPPER_PREVIEW === true;
  const BUILD = '6.2.0';
  const app = document.querySelector('#app');
  // The server assigns condition 0, 1, 0, 1... Participants never choose one.
  // psiTurk may render its uniqueId differently across versions. Read the
  // server-issued worker ID from the explicit /exp URL; cross-check uniqueId
  // whenever possible. Never silently substitute correction-only on mismatch.
  const liveQuery = new URLSearchParams(window.location.search);
  const issuedWorker = liveQuery.get('workerId') || '';
  const workerPattern = /^debugP([01])[a-f0-9]{24}$/;
  const workerMatch = issuedWorker.match(workerPattern);
  const uniqueParts = String(window.uniqueId || '').split(':');
  const idMatch = uniqueParts.map(item => item.match(workerPattern)).find(Boolean);
  const urlCondition = workerMatch ? Number(workerMatch[1]) : null;
  const idCondition = idMatch ? Number(idMatch[1]) : null;
  const assignmentConflict = !preview && urlCondition !== null && idCondition !== null && urlCondition !== idCondition;
  let condition = !preview ? (urlCondition !== null ? urlCondition : idCondition) : null;
  if (preview) {
    // Named research previews make both conditions independently testable.
    // Generic preview alternates locally; neither preview writes participant data.
    if (window.PEPPER_PREVIEW_CONDITION === 0 || window.PEPPER_PREVIEW_CONDITION === 1) {
      condition = window.PEPPER_PREVIEW_CONDITION;
    } else try {
      condition = Number(localStorage.getItem('pepper_preview_next') || '0') === 1 ? 1 : 0;
      localStorage.setItem('pepper_preview_next', String(1 - condition));
    } catch (_) { condition = 0; }
  }
  const p = !preview && typeof window.PsiTurk === 'function'
    ? new window.PsiTurk(window.uniqueId, window.adServerLoc, window.mode) : null;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const button = (label, key, style='') => `<button type="button" class="button ${style}" data-action="${esc(key)}">${esc(label)}</button>`;
  const click = (key, fn) => { const el = $(`[data-action="${key}"]`); if (el) el.addEventListener('click', fn); };
  const put = (key, value) => { if (p) p.recordUnstructuredData(key, value); };
  const quiz = [
    [17,24,408],[13,18,234],[16,19,304],[22,14,308],[27,12,324],
    [18,23,414],[24,16,384],[15,27,405],[19,26,494],[32,13,416],
    [14,29,406],[21,17,357],[28,15,420],[23,18,414],[26,17,442]
  ].map(([a,b,correct],i) => {
    const opts = [correct-10,correct,correct+10], shift = i % 3;
    // Put the single Pepper error at the FIRST question of rounds 2 and 3.
    // This keeps it visible even if a two-minute round ends before question 3.
    const wrong = i === 5 || i === 10;
    return {n:i+1,a,b,correct,robot:wrong ? correct-10 : correct,
      wrong,options:[...opts.slice(shift),...opts.slice(0,shift)]};
  });
  const mdmt = [
    ['reliable','Reliable'],['capable','Capable'],
    ['predictable','Predictable'],['skilled','Skilled'],
    ['count_on','Someone you can count on'],['competent','Competent'],
    ['consistent','Consistent'],['meticulous','Meticulous']
  ];
  const demand = [
    ['mental_demand','How mentally demanding was this round?'],
    ['effort','How much effort did you put into this round?'],
    ['time_pressure','How rushed did you feel during this round?']
  ];
  const state = {
    idx:0,completed:0,correct:0,stage:'',startedAt:Date.now(),
    remaining:120000,activeSince:null,tickId:null,phase:1,pending:false,
    ending:false,videoReady:false,videoError:false,soundReady:false,responseAt:0,
    audioEnabled:true,trial:null,trustDraft:{},lastCheckpoint:'',
    phaseExpired:[false,false,false],phaseAnswered:[0,0,0],mathMs:0
  };
  const audio = new Audio();
  audio.preload = 'none';
  let currentClip = '';
  function stopAudio() { audio.pause(); try{audio.currentTime = 0;}catch(_){} }
  function playClip(path) {
    currentClip = path || '';
    stopAudio();
    if (!state.audioEnabled || !currentClip) return;
    audio.src = `static/media/audio/${currentClip}.mp3`;
    audio.play().catch(() => {}); // Replay button remains available if autoplay is blocked.
  }
  function speechControl(path) {
    const isApology = /^f(?:6|11)_0$/.test(path);
    return `<div class="audio-control">${button(isApology?'▶ Hear Pepper apologize':'▶ Hear Pepper','replay-audio')}
      ${button(state.audioEnabled?'Mute voice':'Turn voice on','toggle-audio')}
      <span class="audio-note">Robot-style audio</span></div>`;
  }
  function bindSpeech() {
    click('replay-audio',()=>{if(!state.audioEnabled)state.audioEnabled=true;playClip(currentClip);syncAudioLabel();});
    click('toggle-audio',()=>{state.audioEnabled=!state.audioEnabled;if(!state.audioEnabled)stopAudio();syncAudioLabel();});
  }
  function syncAudioLabel(){ const b=$('[data-action="toggle-audio"]');if(b)b.textContent=state.audioEnabled?'Mute voice':'Turn voice on'; }
  function fmt(ms) {const s=Math.ceil(Math.max(0,ms)/1000);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
  function remain(){return Math.max(0,state.remaining-(state.activeSince===null?0:performance.now()-state.activeSince));}
  function pauseTimer(){
    if(state.activeSince!==null){const spent=performance.now()-state.activeSince;state.remaining=Math.max(0,state.remaining-spent);state.mathMs+=spent;state.activeSince=null;}
    if(state.tickId!==null){clearInterval(state.tickId);state.tickId=null;}
    displayTimer();
  }
  function displayTimer(){const el=$('#countdown');if(el){el.textContent=fmt(remain());el.classList.toggle('urgent',remain()<=30000);}}
  function resumeTimer(){
    if(state.activeSince!==null||state.pending||state.ending)return;
    if(state.remaining<=0){phaseTimeout();return;}
    state.activeSince=performance.now();state.tickId=setInterval(()=>{
      displayTimer();if(remain()<=0)phaseTimeout();
    },100);displayTimer();
  }
  function phaseTimeout(){
    if(state.ending||state.pending||remain()>0)return;
    pauseTimer();stopAudio();state.ending=true;
    const currentPhase=state.phase, q=quiz[state.idx];
    if(q && state.idx < currentPhase*5){
      const t=state.trial || {n:q.n,a:q.a,b:q.b,correct:q.correct,robot:q.robot};
      t.timed_out=true;put(`q${q.n}`,JSON.stringify(t));
    }
    state.phaseExpired[currentPhase-1]=true;
    put(`phase_${currentPhase}_time_expired`,1);
    put(`phase_${currentPhase}_questions_answered`,state.phaseAnswered[currentPhase-1]);
    state.idx=currentPhase*5;
    save(`phase_${currentPhase}_timeout`,()=>{
      state.ending=false;
      layout('Round finished',`Round ${currentPhase}: time is up`,
        'Your two-minute math period has ended. You can still complete the ratings.',
        `<div class="simple-card"><p>You completed ${state.phaseAnswered[currentPhase-1]} of 5 questions in this round.</p>
        <p>Unfinished questions are skipped. Next, please rate Pepper and the workload.</p></div>
        ${button('Continue to ratings','timeout-continue','primary')}`,'none');
      click('timeout-continue',()=>showTrust(currentPhase,0));
    });
  }
  function save(checkpoint, next){
    if(state.pending)return;
    pauseTimer();
    if(preview){state.lastCheckpoint=checkpoint;if(next)next();return;}
    if(!p){saveError(checkpoint,next,'Could not connect to local psiTurk. Tell the researcher.');return;}
    state.pending=true;
    put('last_checkpoint',checkpoint);
    document.querySelectorAll('button').forEach(b=>b.disabled=true);
    const note=$('#save-message');if(note)note.textContent='Saving answers…';
    const success=()=>{state.pending=false;state.lastCheckpoint=checkpoint;if(next)next();};
    const error=()=>{state.pending=false;saveError(checkpoint,next,'Saving failed. Ask the researcher to check the local server.');};
    try{p.saveData({success,error});}catch(_){error();}
  }
  function saveError(checkpoint,next,message){
    pauseTimer();
    const note=$('#save-message');if(!note)return;
    note.innerHTML=`<span role="alert">${esc(message)}</span> ${button('Try saving again','retry-save','primary')}`;
    click('retry-save',()=>save(checkpoint,next));
  }
  function shell(){
    app.innerHTML=`<main class="study" id="study"><header class="topbar">
      <span class="wordmark"><span class="mark">P</span>Pepper <span class="wordmark-divider">/</span> Math Tutor</span>
      <span id="top-status" class="top-status">Research study</span></header>
      <section class="workarea" id="workarea"><section class="content" id="content-pane">
      <p id="stage" class="eyebrow"></p><h1 id="title"></h1><p id="subtitle" class="subheading"></p>
      <div id="study-content"></div><div id="save-message" class="save-message" role="status"></div></section>
      <aside class="aside" id="aside"><div id="example-panel" class="example-panel"></div>
      <div class="media-panel" id="media-panel" hidden><div class="video-box">
      <video id="robot-video" muted autoplay loop playsinline preload="auto" aria-label="Pepper robot video">
      <source src="static/media/pepper_loop.mp4" type="video/mp4"></video>
      <div class="media-fallback" id="media-fallback" hidden>Video unavailable</div></div>
      <div class="speech-card" id="speech-card" hidden><span>Pepper says</span><p id="robot-speech"></p></div></div>
      </aside></section><footer class="footer"><span>Pepper Math Tutor Study · <button type="button" class="footer-exit" data-action="footer-exit">Exit study</button></span><span>${preview?'PREVIEW — responses not saved':'LOCAL RECORDED SESSION'}</span></footer></main>`;
    const v=$('#robot-video');
    v.addEventListener('playing',()=>{state.videoReady=true;state.videoError=false;$('#media-fallback').hidden=true;updateVideoCheck();});
    v.addEventListener('error',()=>{state.videoReady=false;state.videoError=true;$('#media-fallback').hidden=false;updateVideoCheck();});
    click('footer-exit',exitStudy);
  }
  function layout(stage,title,subtitle,body,side='none',speech=''){
    pauseTimer();stopAudio();state.stage=stage;
    $('#study').dataset.stage=stage;
    $('#stage').textContent=stage;
    $('#title').textContent=title;
    $('#subtitle').textContent=subtitle||'';$('#subtitle').hidden=!subtitle;
    $('#study-content').innerHTML=body;
    $('#save-message').textContent='';
    const math=['Your answer','Pepper’s suggestion'].includes(stage);
    $('#top-status').innerHTML=math
      ? `<span class="timer">Round ${state.phase} · Time left <strong id="countdown">${fmt(remain())}</strong></span><span class="progress"> ${state.phaseAnswered[state.phase-1]}/5 answered</span>`
      : 'Research study';
    const media=['video','initial','suggestion','correction'].includes(side);
    const aside=$('#aside');
    $('#media-panel').hidden=!media;$('#example-panel').hidden=media;
    $('#workarea').classList.toggle('full-width',['Consent','Demographics','Sound check','Capacity trust','Workload','Final feedback','Complete','Exit'].includes(stage));
    aside.hidden=['Consent','Demographics','Sound check','Capacity trust','Workload','Final feedback','Complete','Exit'].includes(stage);
    if(media){
      $('#speech-card').hidden=side==='video';
      $('#robot-speech').textContent=speech;
      const v=$('#robot-video');v.play().catch(()=>{});
    }else if(side==='pepper'){
      $('#example-panel').innerHTML=`<img src="static/media/pepper_photo.jpg" class="pepper-photo" alt="Pepper, the white humanoid robot tutor, waving hello"><p class="side-label">Meet Pepper, your robot tutor</p>`;
    }else{
      const images={step1:'instruction_initial.png',step2:'instruction_recommendation.png',step3:'instruction_feedback.png',step4:'instruction_trust.png'};
      $('#example-panel').innerHTML=images[side]
        ? `<p class="side-label">Example of what you will see</p><img class="example-image" src="static/media/${images[side]}" alt="Example study screen">`
        : `<img class="pepper-photo" src="static/media/pepper_photo.jpg" alt="Pepper robot">`;
    }
    displayTimer();
  }
  function start(){
    if(!app)return;
    if(assignmentConflict || condition===null){app.innerHTML='<main class="no-session">This session could not be verified. Please ask the researcher to open a NEW participant session at <strong>http://127.0.0.1:22362/study</strong>. Refreshing this page does not create a new session.</main>';return;}
    shell();put('study_version',BUILD);put('condition',condition);
    if (!preview && /^\d+$/.test(liveQuery.get('pepperSequence') || '')) {
      put('server_assignment_number',Number(liveQuery.get('pepperSequence')));
    }
    put('completed',0);put('questions_completed',0);
    showConsent();
  }
  function exitStudy(){
    pauseTimer();stopAudio();state.ending=true;
    put('withdrew',1);
    layout('Exit','Study ended','','<div class="simple-card"><p>You may close this page. You will not see any more study questions.</p></div>');
  }
  function showConsent(){
    layout('Consent','Study consent','Please read before choosing whether to participate.',`
      <div class="simple-card consent-card">
      <p><strong>Study purpose:</strong> This study looks at how adults respond to help from Pepper, a robot math tutor.</p>
      <p><strong>Risks:</strong> There are no known risks associated with this study.</p>
      <p><strong>Benefits:</strong> There may be no direct benefit to you. Your answers may help improve robot tutoring.</p>
      <p><strong>Privacy:</strong> Collected study responses are anonymous. We do not ask for your name or email. Please do not include identifying information in your written feedback.</p>
      <p><strong>Your choice:</strong> Participation is voluntary. You may exit the experiment at any time, without penalty.</p>
      <p><strong>Questions or concerns?</strong> Email <a href="mailto:motasemamereh6@gmail.com">motasemamereh6@gmail.com</a>.</p>
      <p><strong>Eligibility:</strong> You must be 18 years or older to take part.</p></div>
      <label class="check-row"><input type="checkbox" id="consent-check"> I have read the information and agree to participate.</label>
      ${button('Agree and continue','consent-next','primary')} ${button('Decline','decline')}`);
    $('[data-action="consent-next"]').disabled=true;
    $('#consent-check').addEventListener('change',e=>{$('[data-action="consent-next"]').disabled=!e.target.checked;});
    click('decline',exitStudy);
    click('consent-next',()=>{put('consent',1);save('consent',showDemographics);});
  }
  function selectField(label,name,values){return `<label class="field"><span>${esc(label)}</span>
    <select name="${esc(name)}" required><option value="">Select one</option>
    ${values.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>`;}
  const experience=[['none','None'],['little','A little'],['some','Some'],['a_lot','A lot'],['prefer_not','Prefer not to say']];
  function showDemographics(){
    layout('Demographics','A few questions about you','Answers are anonymous. The study is for adults only.',`
      <form id="demographics" class="form-grid" novalidate>
      <label class="field"><span>Age (in years)</span><input type="number" name="age" id="age" min="18" max="110" step="1" placeholder="Enter your age" required inputmode="numeric"></label>
      ${selectField('Gender','gender',[['woman','Woman'],['man','Man'],['nonbinary','Nonbinary'],['self_describe','Another identity'],['prefer_not','Prefer not to say']])}
      ${selectField('How much experience do you have using psiTurk?','psiturk_experience',experience)}
      ${selectField('How much experience do you have with robots?','robot_experience',experience)}
      <div class="form-actions"><p class="validation" id="form-error" role="alert"></p>
      <button class="button primary" type="submit">Continue</button> ${button('Exit study','exit-demo')}</div></form>`);
    click('exit-demo',exitStudy);
    $('#demographics').addEventListener('submit',e=>{
      e.preventDefault();const f=new FormData(e.currentTarget);const ageStr=String(f.get('age')||'');
      const age=Number(ageStr);
      if(!ageStr||!Number.isInteger(age)||age<18){$('#form-error').textContent='Please enter a whole-number age of at least 18.';return;}
      if(age>110){$('#form-error').textContent='Please check your age. Enter a realistic age from 18 to 110.';return;}
      if(['gender','psiturk_experience','robot_experience'].some(n=>!f.get(n))){$('#form-error').textContent='Please answer all the questions.';return;}
      put('age',age);
      ['gender','psiturk_experience','robot_experience'].forEach(n=>put(n,f.get(n)));
      save('demographics',showVideoCheck);
    });
  }
  function updateVideoCheck(){
    if(state.stage!=='Video check')return;
    const note=$('#video-status'),yes=$('[data-action="video-yes"]');if(!note||!yes)return;
    note.textContent=state.videoReady?'The video is playing. Can you see Pepper move?':state.videoError?'The video did not load. Please tell the researcher.':'Checking the video…';
    yes.disabled=!state.videoReady;
  }
  function showVideoCheck(){
    layout('Video check','Check Pepper’s video','Make sure the robot video is moving before you begin.',`
      <div class="simple-card"><p>This is Pepper, the robot who will help you with math.</p>
      <p>When you can see Pepper moving, click <strong>Yes, it works</strong>.</p></div>
      <p id="video-status" class="status-text" role="status">Checking the video…</p>
      ${button('Yes, it works','video-yes','primary')} ${button('Play video again','video-retry')}`,'video');
    click('video-retry',()=>{const v=$('#robot-video');v.load();v.play().catch(updateVideoCheck);});
    click('video-yes',()=>{if(state.videoReady){put('video_confirmed',1);save('video_check',showSoundCheck);}});
    updateVideoCheck();
  }
  // Audio must be user-initiated because Chrome blocks autoplay with no gesture.
  // This check does not use a timer, and the participant confirms hearing it.
  function showSoundCheck(){
    state.soundReady=false;
    layout('Sound check','Can you hear Pepper?','Please test the sound before starting the activity.',`
      <div class="simple-card"><p>Pepper will read questions and suggestions aloud during the experiment.</p>
      <p>Turn on your device speakers or headphones, then select <strong>Play test sound</strong>.</p></div>
      ${button('▶ Play test sound','sound-play','primary')}
      <p id="sound-status" class="status-text" role="status" aria-live="polite">The test sound has not played yet.</p>
      <label class="check-row"><input type="checkbox" id="heard-sound" disabled> I heard Pepper's voice clearly.</label>
      ${button('Continue to instructions','sound-next','primary')}
      ${button('I cannot hear anything','sound-help')}`,'none');
    $('[data-action="sound-next"]').disabled=true;
    click('sound-play',()=>{
      state.audioEnabled=true;
      currentClip='sound_check';
      stopAudio();
      audio.src='static/media/audio/sound_check.mp3';
      $('#sound-status').textContent='Playing Pepper’s sample voice…';
      audio.play().then(()=>{
        if(state.stage!=='Sound check')return;
        state.soundReady=true;
        $('#heard-sound').disabled=false;
        $('#sound-status').textContent='Sound played. Check the box only if you could hear Pepper clearly.';
      }).catch(()=>{
        if(state.stage!=='Sound check')return;
        $('#sound-status').textContent='Could not play the sound. Check your device volume or ask the researcher.';
        $('#heard-sound').disabled=true;
        $('#heard-sound').checked=false;
        $('[data-action="sound-next"]').disabled=true;
      });
    });
    $('#heard-sound').addEventListener('change',e=>{
      $('[data-action="sound-next"]').disabled=!(state.soundReady && e.target.checked);
    });
    click('sound-help',()=>{
      $('#sound-status').textContent='Check that your speakers or headphones are connected, unmute your device, raise the volume, then press Play test sound again. Ask the researcher if you still hear nothing.';
    });
    click('sound-next',()=>{
      if(state.soundReady && $('#heard-sound').checked){
        stopAudio();put('sound_confirmed',1);save('sound_check',showInstruction1);
      }
    });
  }
  function showInstruction1(){
    layout('Instructions · 1 of 4','Meet Pepper, your robot tutor','Pepper is a robot that can help with math, but it can make mistakes.',`
      <div class="simple-card"><p>"Hi! I’m Pepper. I will give you <strong>15 multiplication questions</strong> in three rounds of five.</p>
      <p>First, choose your own answer. Then you will see my suggestion and choose your final answer."</p>
      <p>Please do not use a calculator, notes, or another person’s help.</p></div>
      ${button('Next','next1','primary')}`,'pepper');click('next1',showInstruction2);
  }
  function showInstruction2(){
    layout('Instructions · 2 of 4','You make the final choice','Pepper will read each question aloud and suggest an answer.',`
      <div class="simple-card"><p>After picking your first answer, check Pepper’s suggestion. You may follow Pepper or choose a different answer.</p>
      <p>Pepper is a robot and <strong>may give an incorrect suggestion</strong>.</p>
      <p>You can replay Pepper’s spoken questions or turn off the voice.</p></div>
      ${button('Next','next2','primary')}`,'step2');click('next2',showInstruction3);
  }
  function showInstruction3(){
    const message=condition===0
      ? 'When Pepper makes a mistake, he will clearly say "I am sorry, I made a mistake," explain what went wrong, and give the correct answer.'
      : 'When Pepper makes a mistake, he will explain the error and give the correct answer. He will not apologize.';
    layout('Instructions · 3 of 4','Feedback after every answer','Your study version has the following response to errors.',`
      <div class="simple-card"><p>After each final answer, you will see whether you were <strong>correct or incorrect</strong> and how to solve the question.</p>
      <p><strong>How Pepper responds:</strong> ${esc(message)}</p></div>
      ${button('Next','next3','primary')}`,'step3');click('next3',showInstruction4);
  }
  function showInstruction4(){
    layout('Instructions · 4 of 4','Two minutes per round','The timer counts down while you answer math questions.',`
      <div class="simple-card"><p>There are <strong>3 rounds</strong>, each with up to <strong>5 questions</strong> and its own <strong>2-minute countdown</strong>.</p>
      <p>The countdown pauses during feedback and surveys. When time runs out, unanswered questions are skipped.</p>
      <p>After <strong>every round</strong>, you will rate Pepper on 8 trust items and answer 3 workload questions. At the end, you can leave written feedback.</p></div>
      ${button('Start round 1','begin','primary')}`,'step4');click('begin',startPhase);
  }
  function startPhase(){
    state.phase=Math.floor(state.idx/5)+1;state.remaining=120000;state.ending=false;
    put(`phase_${state.phase}_time_expired`,0);put(`phase_${state.phase}_questions_answered`,0);
    showInitial();
  }
  function answerButtons(q,key){return `<div class="answer-grid">${q.options.map(n=>button(n,`${key}-${n}`,'choice')).join('')}</div>`;}
  function recordTrial(row){put(`q${row.n}`,JSON.stringify(row));}
  function showInitial(){
    if(state.idx>=15){showFinalFeedback();return;}
    const q=quiz[state.idx];state.trial=null;
    layout('Your answer',`Question ${q.n} of 15`,`Round ${state.phase} of 3 · Choose your answer before seeing Pepper’s suggestion.`,`
      <div class="math-card"><span>What is the answer?</span><strong>${q.a} × ${q.b} = ?</strong></div>
      ${answerButtons(q,'initial')}${speechControl(`q${q.n}`)}
      <p class="hint">Choose an answer to continue.</p>`,'initial',`What is ${q.a} times ${q.b}?`);
    bindSpeech();state.responseAt=performance.now();resumeTimer();playClip(`q${q.n}`);
    for(const n of q.options)click(`initial-${n}`,()=>{
      if(state.activeSince===null||state.pending)return;
      const rt=Math.round(performance.now()-state.responseAt);pauseTimer();
      state.trial={n:q.n,a:q.a,b:q.b,correct:q.correct,robot:q.robot,initial:n,initial_ms:rt};
      recordTrial(state.trial);save(`q${q.n}_initial`,()=>showSuggestion(state.trial));
    });
  }
  function showSuggestion(row){
    const q=quiz[state.idx];
    layout('Pepper’s suggestion',`Question ${q.n} of 15`,'Pepper has suggested an answer. Choose your final answer.',`
      <div class="two-answers"><div><small>Your first answer</small><strong>${row.initial}</strong></div>
      <div class="pepper-answer"><small>Pepper suggests</small><strong>${q.robot}</strong></div></div>
      <p class="answer-heading">What is your <strong>final answer</strong>?</p>${answerButtons(q,'final')}
      ${speechControl(`s${q.n}`)}<p class="hint">You can agree or disagree with Pepper.</p>`,'suggestion',`My suggested answer is ${q.robot}. What do you think?`);
    bindSpeech();state.responseAt=performance.now();resumeTimer();playClip(`s${q.n}`);
    for(const n of q.options)click(`final-${n}`,()=>{
      if(state.activeSince===null||state.pending)return;
      pauseTimer();row.final=n;row.final_ms=Math.round(performance.now()-state.responseAt);
      row.feedback_seen=false;row.timed_out=false;recordTrial(row);
      state.completed++;state.correct+=Number(n===q.correct);state.phaseAnswered[state.phase-1]++;
      put('questions_completed',state.completed);
      put(`phase_${state.phase}_questions_answered`,state.phaseAnswered[state.phase-1]);
      save(`q${q.n}_final`,()=>showFeedback(q,row));
    });
  }
  function worked(q){const tens=Math.floor(q.b/10)*10,ones=q.b%10;
    return `${q.a} × ${q.b} = ${q.a} × (${tens} + ${ones}) = ${q.a*tens} + ${q.a*ones} = ${q.correct}.`;}
  function feedbackText(q){
    const explanation=worked(q);
    if(!q.wrong)return `The correct answer is ${q.correct}. Here is how to check it: ${explanation}`;
    if(condition===0)return `I am sorry. I made a mistake. I told you ${q.robot}, but that was incorrect. That was my fault, and I understand it may have confused you. I should have checked my math before suggesting an answer. The correct answer is ${q.correct}. Here is how I checked it: ${explanation} I will be more careful next time.`;
    return `My suggestion of ${q.robot} was incorrect. The correct answer is ${q.correct}. Here is the calculation: ${explanation}`;
  }
  function showFeedback(q,row){
    const right=row.final===q.correct,msg=feedbackText(q);
    const robotApologized=q.wrong && condition===0;
    const clip=q.wrong?`f${q.n}_${condition}`:`f${q.n}`;
    layout('Answer feedback',right?'Correct!':'Not quite',`Feedback for question ${q.n}.`,`
      <div class="simple-card ${right?'feedback-right':'feedback-wrong'}"><p><strong>Your final answer:</strong> ${row.final}
      · <strong>Correct answer:</strong> ${q.correct}</p><p>${right?'You got it right.':'Your answer was incorrect.'}</p></div>
      <div class="simple-card feedback-robot ${robotApologized?'apology-repair':''}">
      <strong>${robotApologized?'Pepper apologizes and corrects his mistake:':'Pepper says:'}</strong><p>${esc(msg)}</p></div>
      ${speechControl(clip)}${button('Continue','feedback-next','primary')}`,'correction',msg);
    bindSpeech();playClip(clip);
    click('feedback-next',()=>{
      row.feedback_seen=true;row.robot_wrong=q.wrong;row.robot_apologized=robotApologized;recordTrial(row);
      save(`q${q.n}_feedback`,()=>{
        state.idx++;
        if(state.idx%5===0){put(`phase_${state.phase}_time_expired`,0);showTrust(state.phase,0);}
        else showInitial();
      });
    });
  }
  function choiceScale(name, label, max=7, na=false){
    const values=Array.from({length:max+1},(_,i)=>i);
    return `<fieldset class="rating"><legend>${esc(label)}</legend>
      <div class="rating-options ${na?'has-na':''}">${values.map(n=>`<label><input type="radio" name="${esc(name)}" value="${n}" required><span>${n}</span></label>`).join('')}
      ${na?`<label class="not-fit"><input type="radio" name="${esc(name)}" value="na" required><span>Does not fit</span></label>`:''}</div>
      <div class="endpoints"><span>0 = Not at all</span><span>7 = Very</span></div></fieldset>`;
  }
  function showTrust(round,part){
    if(part===2){showWorkload(round);return;}
    const block=mdmt.slice(part*4,part*4+4);
    layout('Capacity trust',`Rate Pepper · Round ${round}`,
      `Part ${part+1} of 2 · Rate how well each description fits Pepper. Choose “Does not fit” when needed.`,`
      <form id="trust-form" class="ratings-form">${block.map(([key,label])=>choiceScale(key,label,7,true)).join('')}
      <p class="validation" id="trust-error" role="alert"></p>
      <button class="button primary" type="submit">${part===0?'Next trust ratings':'Next: workload'}</button></form>`);
    $('#trust-form').addEventListener('submit',e=>{
      e.preventDefault();const f=new FormData(e.currentTarget);
      if(block.some(([key])=>!f.has(key))){$('#trust-error').textContent='Please rate all four items.';return;}
      block.forEach(([key])=>{const n=f.get(key);state.trustDraft[key]=n==='na'?null:Number(n);});
      if(part===1){put(`mdmt_${round}`,JSON.stringify(state.trustDraft));}
      save(`mdmt_${round}_part_${part+1}`,()=>showTrust(round,part+1));
    });
  }
  function showWorkload(round){
    layout('Workload',`Your workload · Round ${round}`,
      'Think about the math questions in the round you just completed.',`
      <form id="workload-form" class="ratings-form">${demand.map(([key,label])=>choiceScale(key,label)).join('')}
      <p class="validation" id="workload-error" role="alert"></p>
      <button class="button primary" type="submit">${round===3?'Continue to feedback':'Start next round'}</button></form>`);
    $('#workload-form').addEventListener('submit',e=>{
      e.preventDefault();const f=new FormData(e.currentTarget);
      if(demand.some(([key])=>!f.has(key))){$('#workload-error').textContent='Please answer the three workload ratings.';return;}
      put(`workload_${round}`,JSON.stringify(Object.fromEntries(demand.map(([key])=>[key,Number(f.get(key))]))));
      state.trustDraft={};
      save(`workload_${round}`,()=>{
        if(round===3)showFinalFeedback();
        else {state.idx=round*5;startPhase();}
      });
    });
  }
  function showFinalFeedback(){
    layout('Final feedback','One last thing','Your thoughts can help us understand your experience.',`
      <form id="final-form" class="final-form">
      <fieldset class="rating"><legend>Did Pepper apologize after making a mistake?</legend>
      <div class="inline-radio"><label><input type="radio" name="apology_noticed" value="yes" required> Yes</label>
      <label><input type="radio" name="apology_noticed" value="no"> No</label>
      <label><input type="radio" name="apology_noticed" value="unsure"> Not sure</label></div></fieldset>
      <label class="field"><span>What did you think of Pepper and the math activity? (Optional)</span>
      <textarea name="feedback" id="feedback" maxlength="1500" rows="5" placeholder="Share any comments about Pepper, the help, the questions, or the timer."></textarea></label>
      <p class="hint">Please do not write your name, email, or other personal details.</p>
      <button class="button primary" type="submit">Submit study</button></form>`);
    $('#final-form').addEventListener('submit',e=>{
      e.preventDefault();const f=new FormData(e.currentTarget),noticed=f.get('apology_noticed');
      if(!noticed)return;
      put('apology_noticed',noticed);put('open_feedback',String(f.get('feedback')||'').trim());
      put('math_time_ms',Math.round(state.mathMs));
      put('total_elapsed_ms',Date.now()-state.startedAt);put('completed',1);
      state.ending=true;
      layout('Saving','Submitting your answers','Please keep this page open while your responses are saved.',
        '<div class="simple-card"><p>Finishing your study record…</p></div>');
      save('study_complete',showComplete);
    });
  }
  function showComplete(){
    layout('Complete','Thank you for participating!',preview
      ? 'This was a preview; no data was saved.'
      : 'Your responses were saved to the local study database.',`
      <div class="simple-card"><p>You finished <strong>${state.completed}</strong> of 15 math questions and answered
      <strong>${state.correct}</strong> correctly.</p>
      <p><strong>About the study:</strong> Pepper intentionally gave an incorrect suggestion at the first question of rounds 2 and 3.
      We are studying how robot responses to mistakes affect trust. The activity was not meant to evaluate your ability.</p></div>
      <p class="hint">Please close this tab after finishing. To start another participant, the researcher must open /study again. Refreshing this page reuses the current session.</p>`);
  }
  document.addEventListener('DOMContentLoaded',start);
})();
