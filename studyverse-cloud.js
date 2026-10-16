/* =========================================================
   ENGENE STUDYVERSE CLOUD + COMMUNITY LAYER
   ========================================================= */

(function(){

  const URL = window.STUDYVERSE_SUPABASE_URL;
  const KEY = window.STUDYVERSE_SUPABASE_KEY;

  if(
    !URL ||
    !KEY ||
    URL.includes('PASTE_YOUR') ||
    KEY.includes('PASTE_YOUR')
  ){

    console.warn(
      'Studyverse cloud layer is waiting for Supabase URL + publishable key.'
    );

    return;
  }


  if(!window.supabase?.createClient){

    console.error(
      'Supabase JS library was not loaded.'
    );

    return;
  }


  const client =
    window.supabase.createClient(
      URL,
      KEY,
      {
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:true
        }
      }
    );


  window.studyverseClient = client;


  const BASE_URL =
    location.origin +
    location.pathname;


  const VISITOR_KEY =
    'studyverse_visitor_id_v1';

  const VISIT_KEY =
    'studyverse_last_visit_v1';

  const ENTRY_KEY =
    'studyverse_entry_choice_v1';


  let currentUser = null;


  /* =========================================================
     HELPERS
     ========================================================= */

  const escCloud = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#039;'
      }[c])
    );


  const toastCloud = t =>
    typeof window.toast === 'function'
      ? window.toast(t)
      : alert(t);


  /* =========================================================
     VISITOR ANALYTICS
     ========================================================= */

  function visitorId(){

    let id =
      localStorage.getItem(
        VISITOR_KEY
      );


    if(!id){

      id =
        (
          crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now().toString(36) +
              Math.random()
                .toString(36)
                .slice(2)
        ) + '';


      localStorage.setItem(
        VISITOR_KEY,
        id
      );
    }


    return id;
  }


  function source(){

    const p =
      new URLSearchParams(
        location.search
      );


    return (
      p.get('ref') ||
      p.get('utm_source') ||
      'direct'
    )
      .slice(0,40)
      .replace(
        /[^a-zA-Z0-9_\- ]/g,
        ''
      );
  }


  async function recordVisit(){

    try{

      const last =
        Number(
          localStorage.getItem(
            VISIT_KEY
          ) || 0
        );


      if(
        Date.now() - last <
        24 * 60 * 60 * 1000
      ){

        return;
      }


      const {error} =
        await client
          .from('site_visits')
          .insert({
            visitor_id:visitorId(),
            source:source()
          });


      if(!error){

        localStorage.setItem(
          VISIT_KEY,
          String(Date.now())
        );

      }


      if(error){

        console.warn(
          'Visit analytics unavailable:',
          error.message
        );

      }

    }catch(err){

      console.warn(
        'Visit analytics unavailable:',
        err.message
      );

    }
  }


  async function getRegisteredCount(){
    try{
      const {data,error}=await client.rpc('get_public_registered_count');
      if(error){console.warn('Registered counter unavailable:',error.message);return 0;}
      return Number(data||0);
    }catch(err){console.warn('Registered counter unavailable:',err.message);return 0;}
  }

  async function getPublicVisits(){
    try{
      const {data,error}=await client.rpc('get_public_visit_count');
      if(error){console.warn('Public visit counter unavailable:',error.message);return 0;}
      return Number(data||0);
    }catch(err){console.warn('Public visit counter unavailable:',err.message);return 0;}
  }

  /* =========================================================
     CLOUD UI STYLES
     ========================================================= */

  function addStyles(){

    if(!document.getElementById('svRegisteredCountStyle')){
      const style=document.createElement('style');
      style.id='svRegisteredCountStyle';
      style.textContent='.sv-registered-count{font-size:.72em;opacity:.78;margin-top:2px;font-weight:600}';
      document.head.appendChild(style);
    }

    if(
      document.getElementById(
        'studyverseCloudStyles'
      )
    ){

      return;
    }


    const s =
      document.createElement(
        'style'
      );


    s.id =
      'studyverseCloudStyles';


    s.textContent = `

      .sv-community-card{
        grid-column:1/-1;
        background:linear-gradient(
          135deg,
          color-mix(
            in srgb,
            var(--accent-faint) 82%,
            white
          ),
          #fff
        );
        border:1px solid var(--border);
        border-radius:18px;
        padding:18px;
      }


      .sv-community-head{
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:flex-start;
        flex-wrap:wrap;
      }


      .sv-community-head h3{
        margin:0;
        color:var(--accent-ink);
      }


      .sv-reach-number{
        font-size:30px;
        font-weight:900;
        color:var(--accent-ink);
        margin:7px 0;
      }


      .sv-reach-bar{
        height:12px;
        background:var(--accent-faint);
        border-radius:99px;
        overflow:hidden;
        margin:10px 0 7px;
      }


      .sv-reach-bar > div{
        height:100%;
        background:var(--accent);
        width:0;
        transition:width .6s ease;
      }


      .sv-modal{
        position:fixed;
        inset:0;
        background:#0008;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:18px;
        z-index:80;
      }


      .sv-box{
        width:min(720px,100%);
        max-height:90vh;
        overflow:auto;
        background:#fff;
        border:1px solid var(--border);
        border-radius:20px;
        padding:22px;
        box-shadow:var(--shadow);
        color:var(--text);
      }


      .sv-box h2,
      .sv-box h3{
        color:var(--accent-ink);
      }


      .sv-actions{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:12px;
      }


      .sv-close{
        float:right;
        background:transparent !important;
        color:var(--accent-ink) !important;
        border:1px solid var(--border) !important;
      }


      .sv-account-pill{
        font-size:12px;
        padding:7px 10px;
        border-radius:99px;
        background:rgba(255,255,255,.16);
        color:#fff;
        border:1px solid #fff8;
      }


      .sv-feature{
        border:1px solid var(--border);
        border-radius:13px;
        padding:12px;
        margin:9px 0;
        background:#fff;
      }


      .sv-feature-title{
        font-weight:800;
        color:var(--accent-ink);
      }


      .sv-feature-meta{
        font-size:12px;
        color:var(--muted);
        margin-top:4px;
      }


      .sv-status{
        font-size:12px;
        color:var(--muted);
        margin-top:7px;
      }


      .sv-admin{
        background:linear-gradient(
          135deg,
          #fff7fa,
          #fff
        );
        border:2px solid var(--accent);
      }


      @media(max-width:600px){

        .sv-reach-number{
          font-size:25px;
        }

      }

    `;


    document.head.appendChild(s);

  }


  /* =========================================================
     MODALS
     ========================================================= */

  function modal(html){

    document
      .querySelectorAll('.sv-modal')
      .forEach(
        x => x.remove()
      );


    const wrap =
      document.createElement(
        'div'
      );


    wrap.className =
      'sv-modal';


    wrap.innerHTML =
      '<div class="sv-box">' +
      html +
      '</div>';


    document.body.appendChild(
      wrap
    );


    wrap.addEventListener(
      'click',
      e => {

        if(e.target === wrap){

          wrap.remove();

        }

      }
    );


    return wrap;
  }


  function closeModal(el){

    el?.remove();

  }


  /* =========================================================
     GOOGLE LOGIN
     ========================================================= */

  async function googleLogin(){

    try{

      const {error} =
        await client.auth.signInWithOAuth({

          provider:'google',

          options:{

            redirectTo:BASE_URL,

            queryParams:{
              prompt:'select_account'
            }

          }

        });


      if(error){

        toastCloud(
          'Google sign-in could not start: ' +
          error.message
        );

      }

    }catch(err){

      toastCloud(
        'Google sign-in could not start: ' +
        (err.message || 'Unknown error')
      );

    }

  }


  /* =========================================================
     EMAIL LOGIN
     ========================================================= */

  async function emailLogin(
    email,
    box
  ){

    email =
      String(
        email || ''
      ).trim();


    if(
      !/^\S+@\S+\.\S+$/.test(email)
    ){

      toastCloud(
        'Please enter a valid email address.'
      );

      return;
    }


    try{

      const {error} =
        await client.auth.signInWithOtp({

          email,

          options:{
            emailRedirectTo:BASE_URL
          }

        });


      if(error){

        toastCloud(
          'Email sign-in could not start: ' +
          error.message
        );

        return;
      }


      const status =
        box.querySelector(
          '.sv-email-status'
        );


      if(status){

        status.textContent =
          'Magic link sent. Check your email, then return to Studyverse. ✨';

      }

    }catch(err){

      toastCloud(
        'Email sign-in could not start: ' +
        (err.message || 'Unknown error')
      );

    }

  }


  /* =========================================================
     LOGIN SCREEN
     ========================================================= */

  function loginScreen(
    force=false
  ){

    if(
      !force &&
      localStorage.getItem(
        ENTRY_KEY
      )
    ){

      return;
    }


    if(
      currentUser &&
      !force
    ){

      return;
    }


    const el =
      modal(`

        <button
          class="sv-close"
          onclick="
            this.closest('.sv-modal').remove()
          "
        >
          ✕
        </button>


        <div
          style="
            text-align:center;
            padding:10px 0 4px
          "
        >

          <div
            style="font-size:38px"
          >
            🌌
          </div>


          <h2
            style="margin:5px 0"
          >
            STUDYVERSE
          </h2>


          <p class="small">
            Your little corner of the universe
            for getting things done.
          </p>


          <div
            class="sv-actions"
            style="
              justify-content:center;
              margin-top:18px
            "
          >

            <button
              onclick="
                window.studyverseGuest(this)
              "
            >
              Continue as Guest
            </button>

          </div>


          <div
            class="small"
            style="margin:15px 0"
          >
            ──────── or ────────
          </div>


          <div
            class="sv-actions"
            style="justify-content:center"
          >

            <button
              onclick="
                window.studyverseGoogle()
              "
            >
              Continue with Google
            </button>


            <button
              class="secondary"
              onclick="
                window.studyverseEmailLogin(this)
              "
            >
              Continue with Email
            </button>

          </div>


          <p class="sv-status">
            Guest mode keeps data on this browser.
            An account prepares Studyverse for
            cross-device cloud sync.
          </p>

        </div>

      `);


    return el;

  }


  window.studyverseGuest =
    function(btn){

      localStorage.setItem(
        ENTRY_KEY,
        'guest'
      );


      btn
        .closest('.sv-modal')
        .remove();

    };


  window.studyverseGoogle =
    googleLogin;


  window.studyverseEmailLogin =
    function(btn){

      const box =
        btn.closest(
          '.sv-box'
        );


      if(
        box.querySelector(
          '.sv-email-area'
        )
      ){

        return;
      }


      const area =
        document.createElement(
          'div'
        );


      area.className =
        'sv-email-area';


      area.innerHTML = `

        <div
          style="margin-top:14px"
        >

          <input
            class="sv-email"
            type="email"
            placeholder="you@example.com"
            autocomplete="email"
          >


          <button
            style="margin-top:8px"
            class="small"
          >
            SEND MAGIC LINK
          </button>


          <div
            class="sv-email-status sv-status"
          ></div>

        </div>

      `;


      box.appendChild(
        area
      );


      area
        .querySelector(
          'button'
        )
        .onclick =
          () =>
            emailLogin(
              area.querySelector(
                '.sv-email'
              ).value,
              box
            );


      area
        .querySelector(
          '.sv-email'
        )
        .focus();

    };


  /* =========================================================
     ACCOUNT
     ========================================================= */

  async function signOut(){

    try{

      await client.auth.signOut();


      toastCloud(
        'Signed out. Your local Studyverse data is still here.'
      );


      renderAccount();

    }catch(err){

      toastCloud(
        'Could not sign out: ' +
        (err.message || 'Unknown error')
      );

    }

  }


  function renderAccount(){

    let el =
      document.getElementById(
        'svAccountButton'
      );


    if(!el){

      const actions =
        document.querySelector(
          '.hero-actions'
        );


      if(!actions){

        return;
      }


      el =
        document.createElement(
          'button'
        );


      el.id =
        'svAccountButton';


      el.className =
        'ghost';


      el.style.cssText =
        'color:#fff;border-color:#fff8';


      actions.insertBefore(
        el,
        actions.firstChild
      );

    }


    if(currentUser){

      const label =
        currentUser
          .user_metadata
          ?.full_name ||
        currentUser.email ||
        'Account';


      el.textContent =
        '👤 ' + label;


      el.onclick =
        () => accountModal();

    }else{

      el.textContent =
        '👤 Guest';


      el.onclick =
        () => loginScreen(true);

    }

  }


  async function accountModal(){

    if(!currentUser){

      return loginScreen(true);

    }


    const name =
      escCloud(
        currentUser
          .user_metadata
          ?.full_name ||
        'Studyverse member'
      );


    const email =
      escCloud(
        currentUser.email || ''
      );


    modal(`

      <button
        class="sv-close"
        onclick="
          this.closest('.sv-modal').remove()
        "
      >
        ✕
      </button>


      <h2>
        👤 Your Studyverse Account
      </h2>


      <p>
        <b>${name}</b>
        <br>
        <span class="small">
          ${email}
        </span>
      </p>


      <p class="sv-status">
        Signed in with your Studyverse account.
        Your current local tasks remain on this
        browser; cloud task syncing is the next
        layer we can add.
      </p>


      <div class="sv-actions">

        <button
          class="danger"
          onclick="
            window.studyverseSignOut();
            this.closest('.sv-modal').remove()
          "
        >
          LOG OUT
        </button>

      </div>

    `);

  }


  window.studyverseSignOut =
    signOut;


  /* =========================================================
     COMMUNITY CARD
     ========================================================= */

  async function communityCard(){

    const settingsGrid =
      document.querySelector(
        '#settings .settings-grid'
      ) ||
      document.querySelector(
        '#settings'
      );


    if(!settingsGrid){

      return;
    }


    let card =
      document.getElementById(
        'svCommunityCard'
      );


    if(!card){

      card =
        document.createElement(
          'div'
        );


      card.id =
        'svCommunityCard';


      card.className =
        'setting sv-community-card';


      card.innerHTML = `

        <div
          class="sv-community-head"
        >

          <div>

            <h3>
              🌍 Studyverse Community
            </h3>


            <p class="small">
              A little study space that keeps
              growing, one student at a time.
            </p>

          </div>


          <div
            id="svReachNumber"
            class="sv-reach-number"
          >
            Loading…
          </div>

        </div>


        <div
          class="sv-reach-bar"
        >

          <div
            id="svReachFill"
          ></div>

        </div>


        <div
          id="svReachText"
          class="small"
        >
          Checking the latest community milestone…
        </div>


        <div
          class="sv-actions"
        >

          <button
            onclick="
              window.studyverseShare()
            "
          >
            ✨ Share Studyverse
          </button>


          <button
            class="secondary"
            onclick="
              window.studyverseFeedback()
            "
          >
            💌 Help Shape Studyverse
          </button>


          <button
            class="ghost"
            onclick="
              window.studyverseFeatures()
            "
          >
            🗳️ Feature Ideas
          </button>

        </div>

      `;


      settingsGrid.appendChild(
        card
      );

    }


    const registered =
      await getRegisteredCount();

    const reach =
      await getPublicVisits();


    const milestones = [
      10,
      100,
      500,
      1000,
      2000,
      5000,
      10000,
      25000,
      50000,
      100000
    ];


    let next =
      milestones.find(
        x => x > reach
      ) ||
      Math.ceil(
        (reach + 1) /
        100000
      ) * 100000;


    let prev =
      milestones
        .filter(
          x => x <= reach
        )
        .pop() ||
      0;


    const pct =
      next > prev
        ? Math.max(
            0,
            Math.min(
              100,
              (
                (reach - prev) /
                (next - prev)
              ) * 100
            )
          )
        : 100;


    const number =
      document.getElementById(
        'svReachNumber'
      );


    const fill =
      document.getElementById(
        'svReachFill'
      );


    const text =
      document.getElementById(
        'svReachText'
      );


    if(number){

      number.innerHTML =
        '<div>' +
        (reach || 0).toLocaleString() +
        '+ reached</div>' +
        '<div class="sv-registered-count">' +
        (registered || 0).toLocaleString() +
        '+ registered ENGENEs</div>';

    }


    if(fill){

      fill.style.width =
        pct + '%';

    }


    if(text){

      text.textContent =
        reach < next
          ? (
              (next - reach)
                .toLocaleString() +
              ' more to the next milestone • ' +
              '✨ Help Studyverse reach more students'
            )
          : 'New milestone reached! ✨';

    }

  }


  /* =========================================================
     SHARE
     ========================================================= */

  window.studyverseShare =
    async function(){

      const shareUrl =
        BASE_URL +
        '?ref=share';


      const text =
        '🌌 I found Studyverse, a study planner with tasks, study plans, timers, calendars and study companions. You might like it!';


      try{

        if(navigator.share){

          await navigator.share({

            title:
              'ENGENE Studyverse',

            text,

            url:shareUrl

          });

        }else{

          await navigator.clipboard.writeText(
            shareUrl
          );


          toastCloud(
            'Studyverse link copied! ✨'
          );

        }

      }catch(e){

        /* User cancelled share or browser blocked it. */

      }

    };


  /* =========================================================
     FEEDBACK
     ========================================================= */

  window.studyverseFeedback =
    function(){

      modal(`

        <button
          class="sv-close"
          onclick="
            this.closest('.sv-modal').remove()
          "
        >
          ✕
        </button>


        <h2>
          💌 Help Shape Studyverse
        </h2>


        <p class="small">
          You use it. You tell me what could be
          better. I build it. Ideas, bugs, design
          thoughts, study features, anything useful.
        </p>


        <label>
          Category
        </label>


        <select
          id="svFeedbackCategory"
        >

          <option>
            Feature idea
          </option>

          <option>
            Bug / problem
          </option>

          <option>
            Design / UI
          </option>

          <option>
            Study feature
          </option>

          <option>
            Companion feature
          </option>

          <option>
            General feedback
          </option>

        </select>


        <br><br>


        <label>
          Your feedback
        </label>


        <textarea
          id="svFeedbackText"
          maxlength="2000"
          rows="7"
          placeholder="What would you change, add, improve, or fix?"
        ></textarea>


        <div
          class="sv-actions"
        >

          <button
            onclick="
              window.studyverseSendFeedback(this)
            "
          >
            SEND FEEDBACK
          </button>

        </div>


        <div
          id="svFeedbackStatus"
          class="sv-status"
        ></div>

      `);

    };


  window.studyverseSendFeedback =
    async function(btn){

      const box =
        btn.closest(
          '.sv-box'
        );


      const category =
        box.querySelector(
          '#svFeedbackCategory'
        ).value;


      const message =
        box.querySelector(
          '#svFeedbackText'
        ).value.trim();


      const status =
        box.querySelector(
          '#svFeedbackStatus'
        );


      if(
        message.length < 3
      ){

        status.textContent =
          'Please write a little more so I know what you mean. 🖤';

        return;
      }


      btn.disabled =
        true;


      status.textContent =
        'Sending…';


      try{

        const {error} =
          await client
            .from('feedback')
            .insert({

              user_id:
                currentUser?.id ||
                null,

              category,

              message

            });


        if(error){

          status.textContent =
            'Could not send feedback: ' +
            error.message;

          btn.disabled =
            false;

          return;
        }


        status.textContent =
          'Thank you! Your feedback is now in the Studyverse suggestion box. ✨';


        box.querySelector(
          '#svFeedbackText'
        ).value = '';


      }catch(err){

        status.textContent =
          'Could not send feedback: ' +
          (err.message || 'Unknown error');

      }


      btn.disabled =
        false;

    };


  /* =========================================================
     FEATURE IDEAS
     ========================================================= */

  window.studyverseFeatures =
    async function(){

      try{

        const {data,error} =
          await client
            .from('feature_requests')
            .select(
              'id,title,description,status,votes,created_at'
            )
            .order(
              'votes',
              {
                ascending:false
              }
            )
            .limit(30);


        if(error){

          toastCloud(
            'Feature ideas could not be loaded.'
          );

          return;
        }


        const rows =
          (data || [])
            .map(
              x => `

                <div
                  class="sv-feature"
                >

                  <div
                    class="sv-feature-title"
                  >
                    ${escCloud(x.title)}
                  </div>


                  <div>
                    ${escCloud(x.description)}
                  </div>


                  <div
                    class="sv-feature-meta"
                  >
                    ${escCloud(x.status)}
                    •
                    ${Number(
                      x.votes || 0
                    )}
                    votes
                  </div>


                  ${
                    currentUser

                    ? `

                      <button
                        class="small"
                        style="margin-top:8px"
                        onclick="
                          window.studyverseVote(
                            ${Number(x.id)},
                            this
                          )
                        "
                      >
                        👍 Vote
                      </button>

                    `

                    : `

                      <div
                        class="sv-status"
                      >
                        Log in to vote for an idea.
                      </div>

                    `
                  }

                </div>

              `
            )
            .join('');


        modal(`

          <button
            class="sv-close"
            onclick="
              this.closest('.sv-modal').remove()
            "
          >
            ✕
          </button>


          <h2>
            🗳️ Feature Ideas
          </h2>


          <p class="small">
            Tell the coder what would make
            Studyverse better. The most useful
            ideas can become future updates.
          </p>


          <div>

            ${
              rows ||
              '<div class="empty">No feature ideas yet. Be the first.</div>'
            }

          </div>


          <hr>


          <h3>
            Submit an idea
          </h3>


          <input
            id="svFeatureTitle"
            maxlength="120"
            placeholder="Short idea title"
          >


          <br><br>


          <textarea
            id="svFeatureDesc"
            maxlength="2000"
            rows="4"
            placeholder="What should it do and why would it help?"
          ></textarea>


          <div
            class="sv-actions"
          >

            <button
              onclick="
                window.studyverseSubmitFeature(this)
              "
            >
              SUBMIT IDEA
            </button>

          </div>


          <div
            id="svFeatureStatus"
            class="sv-status"
          ></div>

        `);


      }catch(err){

        toastCloud(
          'Feature ideas could not be loaded.'
        );

      }

    };


  /* =========================================================
     VOTE
     ========================================================= */

  window.studyverseVote =
    async function(
      id,
      btn
    ){

      btn.disabled =
        true;


      try{

        const {error} =
          await client.rpc(
            'vote_for_feature',
            {
              p_feature_id:id
            }
          );


        if(error){

          toastCloud(
            'Vote could not be recorded.'
          );

        }else{

          toastCloud(
            'Vote counted! 🖤'
          );

        }

      }catch(err){

        toastCloud(
          'Vote could not be recorded.'
        );

      }


      btn.disabled =
        false;

    };


  /* =========================================================
     SUBMIT FEATURE
     ========================================================= */

  window.studyverseSubmitFeature =
    async function(btn){

      const box =
        btn.closest(
          '.sv-box'
        );


      const title =
        box.querySelector(
          '#svFeatureTitle'
        ).value.trim();


      const description =
        box.querySelector(
          '#svFeatureDesc'
        ).value.trim();


      const status =
        box.querySelector(
          '#svFeatureStatus'
        );


      if(
        title.length < 3
      ){

        status.textContent =
          'Give the idea a short title first.';

        return;
      }


      btn.disabled =
        true;


      try{

        const {error} =
          await client
            .from('feature_requests')
            .insert({

              title,

              description,

              submitted_by:
                currentUser?.id ||
                null

            });


        if(error){

          status.textContent =
            'Could not submit the idea: ' +
            error.message;

          btn.disabled =
            false;

          return;
        }


        status.textContent =
          'Idea submitted! ✨';


        box.querySelector(
          '#svFeatureTitle'
        ).value = '';


        box.querySelector(
          '#svFeatureDesc'
        ).value = '';


      }catch(err){

        status.textContent =
          'Could not submit the idea: ' +
          (err.message || 'Unknown error');

      }


      btn.disabled =
        false;

    };


  /* =========================================================
     CREATOR ANALYTICS
     ========================================================= */

  async function creatorPanel(){

    if(!currentUser){

      return;
    }


    try{

      const {data,error} =
        await client.rpc(
          'get_creator_stats'
        );


      if(error || !data){

        toastCloud(
          'Creator analytics are not available for this account.'
        );

        return;
      }


      const d =
        data;


      modal(`

        <button
          class="sv-close"
          onclick="
            this.closest('.sv-modal').remove()
          "
        >
          ✕
        </button>


        <div
          class="sv-admin"
        >

          <h2>
            🔐 Creator Analytics
          </h2>


          <p class="small">
            Private Studyverse creator view.
          </p>


          <div
            class="statgrid"
          >

            <div
              class="stat"
            >

              <b>
                ${Number(
                  d.visits || 0
                ).toLocaleString()}
              </b>

              Visits recorded

            </div>


            <div
              class="stat"
            >

              <b>
                ${Number(
                  d.unique_visitors || 0
                ).toLocaleString()}
              </b>

              Unique visitors

            </div>


            <div
              class="stat"
            >

              <b>
                ${Number(
                  d.feedback || 0
                ).toLocaleString()}
              </b>

              Feedback messages

            </div>


            <div
              class="stat"
            >

              <b>
                ${Number(
                  d.feature_requests || 0
                ).toLocaleString()}
              </b>

              Feature ideas

            </div>

          </div>


          <p class="sv-status">
            Detailed visitor rows and feedback
            remain in your private Supabase dashboard.
          </p>

        </div>

      `);

    }catch(err){

      toastCloud(
        'Creator analytics are not available for this account.'
      );

    }

  }


  window.studyverseCreatorPanel =
    creatorPanel;


  /* =========================================================
     CREATOR BUTTON
     ========================================================= */

  function addCreatorButton(){

    if(!currentUser){

      return;
    }


    client
      .from('creator_admins')
      .select('user_id')
      .eq(
        'user_id',
        currentUser.id
      )
      .maybeSingle()
      .then(
        ({data,error}) => {

          if(error){

            return;
          }


          if(!data){

            return;
          }


          const settingsGrid =
            document.querySelector(
              '#settings .settings-grid'
            ) ||
            document.querySelector(
              '#settings'
            );


          if(
            !settingsGrid ||
            document.getElementById(
              'svCreatorCard'
            )
          ){

            return;
          }


          const card =
            document.createElement(
              'div'
            );


          card.id =
            'svCreatorCard';


          card.className =
            'setting sv-admin';


          card.innerHTML = `

            <h3>
              🔐 Creator Analytics
            </h3>


            <p class="small">
              Private. Only your creator account
              can open this.
            </p>


            <button
              onclick="
                window.studyverseCreatorPanel()
              "
            >
              OPEN CREATOR ANALYTICS
            </button>

          `;


          settingsGrid.appendChild(
            card
          );

        }
      );

  }


  /* =========================================================
     SETTINGS HOOK
     ========================================================= */

  function hookSettings(){

    const obs =
      new MutationObserver(
        () => {

          const settings =
            document.getElementById(
              'settings'
            );


          if(
            settings &&
            !document.getElementById(
              'svCommunityCard'
            )
          ){

            communityCard();

          }


          addCreatorButton();

        }
      );


    obs.observe(
      document.body,
      {
        childList:true,
        subtree:true
      }
    );


    setTimeout(
      () => communityCard(),
      500
    );

  }


  /* =========================================================
     INITIALIZE
     ========================================================= */

  async function init(){

    addStyles();


    await recordVisit();


    try{

      const {data} =
        await client.auth.getSession();


      currentUser =
        data.session?.user ||
        null;

    }catch(err){

      currentUser =
        null;

    }


    renderAccount();


    client.auth.onAuthStateChange(
      (
        _event,
        session
      ) => {

        currentUser =
          session?.user ||
          null;


        renderAccount();


        addCreatorButton();

      }
    );


    hookSettings();


    setTimeout(
      () => {

        if(!currentUser){

          loginScreen(
            false
          );

        }

      },
      900
    );

  }


  if(
    document.readyState ===
    'loading'
  ){

    document.addEventListener(
      'DOMContentLoaded',
      init
    );

  }else{

    init();

  }

})();

/* Syncs this user's existing ENGENEverse browser data to their Supabase account. */
(() => {
  'use strict';
  const TABLE = 'user_app_data';
  const BUCKET = 'engene-user-backgrounds';
  const META_PREFIX = 'engene_cloud_sync_meta_v1:';
  const EXCLUDED_KEYS = new Set(['esc_timer_session_v1']);
  const state = { client: null, userId: null, busy: false, applying: false, timer: null, ready: false };
  const statusNode = () => document.getElementById('cloudSyncStatus');
  const showStatus = (text, bad = false) => {
    const node = statusNode();
    if (node) { node.textContent = text; node.dataset.error = String(bad); }
  };
  const client = () => window.ENGENE_SUPABASE_CLIENT || null;
  const metaKey = () => META_PREFIX + state.userId;
  const readMeta = () => { try { return JSON.parse(localStorage.getItem(metaKey()) || 'null'); } catch (_) { return null; } };
  const writeMeta = (meta) => { try { localStorage.setItem(metaKey(), JSON.stringify(meta)); } catch (_) {} };
  const getLocalData = () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('esc_') || key.endsWith('_corrupt_backup') || EXCLUDED_KEYS.has(key)) continue;
      data[key] = localStorage.getItem(key);
    }
    return Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
  };
  const stableString = (value) => JSON.stringify(value, Object.keys(value || {}).sort());
  async function hash(value) {
    const input = typeof value === 'string' ? value : JSON.stringify(value);
    if (window.crypto?.subtle && window.TextEncoder) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
    return String(h >>> 0);
  }
  const parse = (value) => { try { return JSON.parse(value); } catch (_) { return value; } };
  const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
  function mergeValues(remote, local, key) {
    if (local === undefined) return remote;
    if (remote === undefined) return local;
    if (Array.isArray(remote) && Array.isArray(local)) {
      if (key === 'esc_tasks_v2') {
        const merged = new Map();
        [...remote, ...local].forEach((item) => {
          const identity = item?.created ? `${item.created}|${item.name}|${item.subject}` : `${item?.name}|${item?.subject}|${item?.deadline}`;
          const previous = merged.get(identity);
          merged.set(identity, previous ? { ...previous, ...item } : item);
        });
        const items = [...merged.values()].sort((a, b) => {
          const aOrder = Number(a?.order), bOrder = Number(b?.order);
          const aHasOrder = Number.isFinite(aOrder) && aOrder >= 0;
          const bHasOrder = Number.isFinite(bOrder) && bOrder >= 0;
          if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder;
          if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
          return Number(a?.no || 0) - Number(b?.no || 0) || String(a?.created || '').localeCompare(String(b?.created || ''));
        });
        const used = new Set();
        items.forEach((item, index) => {
          item.order = index;
          let no = Number(item.no) || index + 1;
          if (used.has(no)) no = Math.max(0, ...used) + 1;
          used.add(no); item.no = no;
        });
        return items;
      }
      const merged = new Map();
      [...remote, ...local].forEach((item, index) => {
        const id = item && typeof item === 'object' ? (item.id || item.no || JSON.stringify(item)) : String(item);
        const old = merged.get(String(id));
        merged.set(String(id), old && isObject(old) && isObject(item) ? { ...old, ...item } : item);
      });
      return [...merged.values()];
    }
    if (isObject(remote) && isObject(local)) {
      const result = { ...remote };
      Object.keys(local).forEach((field) => { result[field] = mergeValues(remote[field], local[field], field); });
      return result;
    }
    return local;
  }
  function mergeSnapshots(remote, local) {
    const result = { ...remote };
    Object.keys(local).forEach((key) => {
      const remoteValue = Object.prototype.hasOwnProperty.call(remote, key) ? parse(remote[key]) : undefined;
      const localValue = parse(local[key]);
      result[key] = JSON.stringify(mergeValues(remoteValue, localValue, key));
    });
    return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
  }
  function replaceLocalData(data) {
    state.applying = true;
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('esc_') && !key.endsWith('_corrupt_backup') && !EXCLUDED_KEYS.has(key)) localStorage.removeItem(key);
      }
      Object.entries(data || {}).forEach(([key, value]) => {
        if (key.startsWith('esc_') && typeof value === 'string') localStorage.setItem(key, value);
      });
    } finally { state.applying = false; }
  }
  async function saveRemote(data, backgroundPath) {
    const { data: row, error } = await state.client.from(TABLE).upsert({
      user_id: state.userId, data, background_path: backgroundPath || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).select('updated_at,background_path').single();
    if (error) throw error;
    return row;
  }
  async function uploadBackground(blob, existingPath) {
    if (!blob) return existingPath || null;
    const path = `${state.userId}/background`;
    const { error } = await state.client.storage.from(BUCKET).upload(path, blob, {
      upsert: true, contentType: blob.type || 'image/webp', cacheControl: '3600',
    });
    if (error) throw error;
    return path;
  }
  async function downloadBackground(path) {
    if (!path) return null;
    const { data, error } = await state.client.storage.from(BUCKET).download(path);
    if (error) throw error;
    return data;
  }
  async function applyBackground(blob) {
    state.applying = true;
    try {
      if (blob) await window.putBackgroundBlob(blob);
      else await window.removeBackgroundBlob();
      if (typeof window.initBackground === 'function') await window.initBackground();
    } finally { state.applying = false; }
  }
  async function syncNow() {
    if (state.busy || !state.client || !state.userId || !navigator.onLine) return;
    state.busy = true;
    showStatus('Saving your app to your account…');
    try {
      const { data: remote, error } = await state.client.from(TABLE).select('data,background_path,updated_at').eq('user_id', state.userId).maybeSingle();
      if (error) throw error;
      const local = getLocalData();
      const localHash = await hash(local);
      const meta = readMeta();
      let dataToSave = local;
      let backgroundPath = remote?.background_path || null;
      let shouldSave = false;
      let shouldReload = false;
      let localBackground = null;
      try { localBackground = await window.getBackgroundBlob(); } catch (_) {}

      if (!remote) {
        dataToSave = local;
        backgroundPath = await uploadBackground(localBackground, null);
        shouldSave = true;
      } else if (!meta) {
        dataToSave = mergeSnapshots(remote.data || {}, local);
        backgroundPath = localBackground ? await uploadBackground(localBackground, remote.background_path) : remote.background_path;
        shouldSave = true;
        shouldReload = JSON.stringify(dataToSave) !== JSON.stringify(local);
        if (!localBackground && remote.background_path) {
          const blob = await downloadBackground(remote.background_path);
          await applyBackground(blob);
        }
      } else if (localHash !== meta.localHash && remote.updated_at === meta.cloudUpdatedAt) {
        // Only this browser changed since its last successful sync. Replacing the snapshot
        // here also syncs deletions instead of bringing deleted items back.
        dataToSave = local;
        if (localBackground) backgroundPath = await uploadBackground(localBackground, remote.background_path);
        else if (meta.hadBackground) {
          const { error: removeError } = await state.client.storage.from(BUCKET).remove([`${state.userId}/background`]);
          if (removeError) throw removeError;
          backgroundPath = null;
        }
        shouldSave = true;
      } else if (localHash !== meta.localHash && remote.updated_at !== meta.cloudUpdatedAt) {
        dataToSave = mergeSnapshots(remote.data || {}, local);
        backgroundPath = localBackground ? await uploadBackground(localBackground, remote.background_path) : remote.background_path;
        shouldSave = true;
        shouldReload = JSON.stringify(dataToSave) !== JSON.stringify(local);
      } else if (remote.updated_at !== meta.cloudUpdatedAt) {
        dataToSave = remote.data || {};
        shouldReload = JSON.stringify(dataToSave) !== JSON.stringify(local);
        if (remote.background_path) {
          const blob = await downloadBackground(remote.background_path);
          await applyBackground(blob);
        } else if (meta.hadBackground) {
          await applyBackground(null);
        }
      } else {
        showStatus('Everything is saved to your account.');
        state.ready = true;
        return;
      }

      let saved = remote;
      if (shouldSave) saved = await saveRemote(dataToSave, backgroundPath);
      if (shouldReload) replaceLocalData(dataToSave);
      const finalHash = await hash(dataToSave);
      writeMeta({ cloudUpdatedAt: saved?.updated_at || remote?.updated_at || null, localHash: finalHash, hadBackground: Boolean(backgroundPath) });
      state.ready = true;
      if (shouldReload) {
        showStatus('Your saved data was loaded. Refreshing the app…');
        setTimeout(() => location.reload(), 250);
      } else showStatus('Everything is saved to your account.');
    } catch (error) {
      console.error('ENGENEverse cloud save failed:', error);
      const message = error?.message || 'Could not save to your account.';
      if (/user_app_data|relation|does not exist/i.test(message)) showStatus('Cloud saving needs its Supabase setup step. Open the setup guide.', true);
      else if (/row-level security|permission|policy/i.test(message)) showStatus('Supabase blocked this save. Check the cloud setup guide and your sign-in.', true);
      else showStatus('Cloud save could not connect. Your data is still saved in this browser.', true);
    } finally { state.busy = false; }
  }
  function scheduleSync() {
    if (state.applying || !state.userId) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => syncNow(), 1300);
  }
  function installListeners() {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const result = originalSet.call(this, key, value);
      if (this === localStorage && String(key).startsWith('esc_')) scheduleSync();
      return result;
    };
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      const result = originalRemove.call(this, key);
      if (this === localStorage && String(key).startsWith('esc_')) scheduleSync();
      return result;
    };
    window.addEventListener('engene-background-changed', scheduleSync);
    window.addEventListener('online', scheduleSync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
    setInterval(() => { if (state.userId) syncNow(); }, 45000);
  }
  async function initialize() {
    installListeners();
    state.client = client();
    if (!state.client) { showStatus('Cloud saving is not configured on this copy of the app.', true); return; }
    const connect = async () => {
      const { data, error } = await state.client.auth.getSession();
      if (error) throw error;
      const session = data.session;
      if (!session?.user?.id) {
        state.userId = null;
        showStatus('Sign in to your website to save your app to your account.');
        return;
      }
      if (state.userId !== session.user.id) state.userId = session.user.id;
      await syncNow();
    };
    try { await connect(); }
    catch (error) { console.error('Could not read the signed-in Supabase account:', error); showStatus('Could not check your sign-in. Your data remains saved in this browser.', true); }
    state.client.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user?.id || null;
      if (nextId !== state.userId) { state.userId = nextId; state.ready = false; }
      if (nextId) setTimeout(() => syncNow(), 0);
      else showStatus('Sign in to your website to save your app to your account.');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
