/* ── Firebase 통합 (Modular SDK v10) ── */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyDohqK6enK4y1RSjkYnDGlxtHb5eSo3TWs",
  authDomain: "no-damm-sup.firebaseapp.com",
  projectId: "no-damm-sup",
  storageBucket: "no-damm-sup.firebasestorage.app",
  messagingSenderId: "1072430359524",
  appId: "1:1072430359524:web:5bf91b96c3d907726a5df1",
  measurementId: "G-ZWK7RG5Q5C"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* ── 0. Lenis Smooth Scroll ── */
// Lenis는 defer로 로드되므로 로드 완료 후 초기화
let lenis;

function initLenis() {
  lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 1,
    smoothTouch: false,
    touchMultiplier: 2,
    infinite: false,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
  window.lenis = lenis;

  // 앵커 스무스 스크롤
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const target = this.getAttribute('href');
      if (target === '#') return;
      e.preventDefault();
      lenis.scrollTo(target);
    });
  });
}

// Lenis가 로드됐으면 바로, 아니면 load 이벤트 후 초기화
if (window.Lenis) {
  initLenis();
} else {
  window.addEventListener('load', () => {
    if (window.Lenis) initLenis();
  });
}

/* ── 1. 스크롤 페이드인 + 언더라인 드로잉 ── */
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

// section-title 언더라인 드로잉 (fade-up과 별도 감지)
const titleObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      titleObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.section-title').forEach(el => titleObserver.observe(el));

/* ── 2. 숫자 카운터 애니메이션 ── */
function countUp(id, target, suffix, prefix) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const steps = 60;
  const stepTime = 1200 / steps;
  const increment = target / steps;
  const timer = setInterval(() => {
    current = Math.min(current + increment, target);
    el.textContent = (prefix || '') + Math.floor(current).toLocaleString() + (suffix || '');
    if (current >= target) clearInterval(timer);
  }, stepTime);
}

/* ── 3. 게시판 (Firebase Firestore) ── */
const MASTER_PW = '3141592';

const BADGE = {
  q:      { label: '질문', cls: 'badge-q' },
  review: { label: '후기', cls: 'badge-review' },
};

let firestorePosts  = null;
let currentFilter   = 'all';
let currentRegion   = 'all';
let pendingEditId   = null;
let pendingDeleteId = null;
let pendingReplyId  = null;

function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}



/* ── 관리자 답글 버튼 — Shift 5번으로 활성화 ── */
(function() {
  let shiftCount = 0;
  let shiftTimer = null;
  document.addEventListener('keydown', e => {
    if (e.key === 'Shift') {
      shiftCount++;
      clearTimeout(shiftTimer);
      shiftTimer = setTimeout(() => { shiftCount = 0; }, 2000);
      if (shiftCount >= 5) {
        shiftCount = 0;
        const btn = document.getElementById('hidden-reply-btn');
        if (btn) {
          const isVisible = btn.style.display !== 'none';
          btn.style.display = isVisible ? 'none' : 'inline-block';
        }
      }
    }
  });
})();

// 조회수 로컬 캐시
const viewCounts = {};

// 글 상세 보기 모달
function openPostView(id) {
  const p = firestorePosts.find(p => p.id === id);
  if (!p) return;
  viewCounts[id] = (viewCounts[id] || 0) + 1;
  renderPosts();

  const subject = p.subject || p.title || '(제목 없음)';
  const body    = p.content || p.title || '';

  document.getElementById('postViewTitle').textContent = subject;
  document.getElementById('pv-badge').className = `badge ${BADGE[p.type]?.cls}`;
  document.getElementById('pv-badge').textContent = BADGE[p.type]?.label;
  document.getElementById('pv-region').textContent = `[${p.region}]`;
  document.getElementById('pv-meta').textContent = `${p.author} · ${p.date}`;
  document.getElementById('pv-body').textContent = body;

  const replies = p.replies || [];
  const repliesHtml = replies.length > 0
    ? replies.map((r, ri) => `
        <div class="reply-item-view" style="flex-direction:column;align-items:flex-start;gap:4px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="color:var(--green);font-weight:600;">↳ ${r.author}</span>
            <span style="color:var(--muted);font-size:11px;">${r.date}</span>
            <button class="action-btn del" onclick="openDeleteReply('${id}',${ri})">삭제</button>
          </div>
          <div style="word-break:break-word;white-space:pre-wrap;line-height:1.6;overflow-wrap:break-word;font-size:13px;padding-left:4px;">${r.content}</div>
        </div>`).join('')
    : '<p style="color:var(--muted);font-size:13px;">아직 답글이 없습니다.</p>';

  const replyAreaTitle = p.type === 'q' ? '<div style="font-weight:700;font-size:13px;margin-bottom:8px;">💬 답글</div>' : '';
  document.getElementById('pv-replies').innerHTML = replyAreaTitle + repliesHtml;

  const safeSubject = (p.subject||p.title||'').replace(/'/g,"\'");
  const safeContent = (p.content||'').replace(/'/g,"\'");
  // 답글 버튼: 숨김 처리 (Shift 5번으로만 활성화)
  const replyBtn = `<button id="hidden-reply-btn" onclick="closePostView();openReplyModal('${id}')"
    style="display:none;padding:8px 16px;background:var(--green);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px;">💬 답글 달기</button>`;

  document.getElementById('pv-actions').innerHTML = `
    ${replyBtn}
    <button onclick="closePostView();openEditModal('${id}','${safeSubject}','${safeContent}')" style="padding:8px 16px;background:#f3f4f6;color:#555;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px;">수정</button>
    <button onclick="closePostView();openDeleteModal('${id}')" style="padding:8px 16px;background:#fdecea;color:#e74c3c;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px;">삭제</button>`;

  document.getElementById('postViewModal').classList.add('open');
  window.lenis?.stop();
}

function closePostView() {
  document.getElementById('postViewModal').classList.remove('open');
  window.lenis?.start();
}

function renderPosts() {
  const tbody   = document.getElementById('board-list');
  const countEl = document.getElementById('post-count');
  if (!tbody || !countEl) return;

  const source   = firestorePosts ?? [];
  const filtered = source.filter(p => {
    const matchType   = currentFilter === 'all' || p.type === currentFilter;
    const matchRegion = currentRegion === 'all' || p.region === currentRegion;
    return matchType && matchRegion;
  });

  countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:40px;text-align:center;color:#999;">첫 번째 글을 남겨보세요!</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((p, idx) => {
    const subject    = p.subject || p.title || '(제목 없음)';
    const replyCount = (p.replies || []).length;
    const replyBadge = replyCount > 0 ? ` <span style="color:var(--green);font-size:11px;">[${replyCount}]</span>` : '';
    return `
      <tr onclick="openPostView('${p.id}')">
        <td><span class="badge ${BADGE[p.type]?.cls}">${BADGE[p.type]?.label}</span></td>
        <td class="col-region">${p.region}</td>
        <td class="col-title"><span class="post-subject">${subject}</span>${replyBadge}</td>
        <td class="col-author">${p.author}</td>
        <td class="col-date">${p.date}</td>
      </tr>`;
  }).join('');
}

function filterPosts(btn, type) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = type;
  renderPosts();
}

function filterRegion(region) {
  currentRegion = region;
  renderPosts();
}

// 실시간 리스너
function setupBoardListener() {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
  onSnapshot(q, snapshot => {
    firestorePosts = snapshot.docs.map(d => ({
      id:      d.id,
      type:    d.data().type,
      region:  d.data().region,
      author:  d.data().author || '익명',
      subject: d.data().subject || d.data().title || '',
      content: d.data().content || d.data().title || '',
      title:   d.data().title || d.data().subject || '',
      pw:      d.data().pw || '',
      replies: d.data().replies || [],
      date:    formatDate(d.data().createdAt),
    }));
    renderPosts();
  }, err => {
    console.warn('Firestore 오류:', err);
    firestorePosts = [];
    renderPosts();
  });
}

// 글 등록
async function addPost() {
  const author  = document.getElementById('post-author')?.value?.trim();
  const pw      = document.getElementById('post-pw')?.value?.trim();
  const type    = document.getElementById('post-type')?.value;
  const region  = document.getElementById('post-region')?.value;
  const subject = document.getElementById('post-subject')?.value?.trim();
  const content = document.getElementById('post-content')?.value?.trim();

  if (!author)  return alert('이름을 입력해주세요.');
  if (!pw)      return alert('비밀번호를 입력해주세요.');
  if (!subject) return alert('제목을 입력해주세요.');
  if (!content) return alert('내용을 입력해주세요.');

  try {
    await addDoc(collection(db, 'posts'), {
      type, region, author, subject, content,
      title: subject,   // 구버전 호환
      pw,
      replies: [],
      createdAt: serverTimestamp(),
    });
    document.getElementById('post-author').value  = '';
    document.getElementById('post-pw').value      = '';
    document.getElementById('post-subject').value = '';
    document.getElementById('post-content').value = '';
    window.closeWriteModal?.();
  } catch(e) {
    console.error(e);
    alert('등록 실패. 다시 시도해주세요.');
  }
}

// 수정
function openEditModal(id, subject, content) {
  pendingEditId = id;
  document.getElementById('edit-subject').value = subject || '';
  document.getElementById('edit-content').value = content || subject || '';
  document.getElementById('edit-pw').value      = '';
  document.getElementById('editModal').style.display = 'flex';
}
function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  pendingEditId = null;
}
async function submitEdit() {
  const pw      = document.getElementById('edit-pw').value.trim();
  const subject = document.getElementById('edit-subject').value.trim();
  const content = document.getElementById('edit-content').value.trim();
  if (!pw || !subject || !content) return alert('비밀번호, 제목, 내용을 모두 입력해주세요.');

  const post = firestorePosts.find(p => p.id === pendingEditId);
  if (!post) return;
  if (pw !== MASTER_PW && pw !== post.pw) return alert('비밀번호가 맞지 않습니다.');

  try {
    await updateDoc(doc(db, 'posts', pendingEditId), { subject, content, title: subject });
    closeEditModal();
  } catch(e) {
    console.error(e);
    alert('수정 실패.');
  }
}

// 삭제
function openDeleteModal(id) {
  pendingDeleteId = id;
  document.getElementById('delete-pw').value = '';
  document.getElementById('deleteModal').style.display = 'flex';
}
function closeDeleteModal() {
  document.getElementById('deleteModal').style.display = 'none';
  pendingDeleteId = null;
}
async function submitDelete() {
  const pw = document.getElementById('delete-pw').value.trim();
  if (!pw) return alert('비밀번호를 입력해주세요.');

  const post = firestorePosts.find(p => p.id === pendingDeleteId);
  if (!post) return;
  if (pw !== MASTER_PW && pw !== post.pw) return alert('비밀번호가 맞지 않습니다.');

  try {
    await deleteDoc(doc(db, 'posts', pendingDeleteId));
    closeDeleteModal();
  } catch(e) {
    console.error(e);
    alert('삭제 실패.');
  }
}

// 답글
function openReplyModal(id) {
  pendingReplyId = id;
  document.getElementById('reply-author').value  = '';
  document.getElementById('reply-pw').value      = '';
  document.getElementById('reply-content').value = '';
  document.getElementById('replyModal').style.display = 'flex';
}
function closeReplyModal() {
  document.getElementById('replyModal').style.display = 'none';
  pendingReplyId = null;
}
async function submitReply() {
  const author  = document.getElementById('reply-author').value.trim();
  const pw      = document.getElementById('reply-pw').value.trim();
  const content = document.getElementById('reply-content').value.trim();
  if (!author || !pw || !content) return alert('모든 항목을 입력해주세요.');

  const now  = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;

  try {
    await updateDoc(doc(db, 'posts', pendingReplyId), {
      replies: arrayUnion({ author, pw, content, date }),
    });
    closeReplyModal();
  } catch(e) {
    console.error(e);
    alert('답글 등록 실패.');
  }
}

// 답글 삭제
async function openDeleteReply(postId, replyIdx) {
  const pw = prompt('비밀번호를 입력하세요 (작성자 비번 또는 마스터 비번):');
  if (!pw) return;

  const post  = firestorePosts.find(p => p.id === postId);
  if (!post) return;
  const reply = post.replies[replyIdx];
  if (!reply) return;
  if (pw !== MASTER_PW && pw !== reply.pw) return alert('비밀번호가 맞지 않습니다.');

  const newReplies = post.replies.filter((_, i) => i !== replyIdx);
  try {
    await updateDoc(doc(db, 'posts', postId), { replies: newReplies });
  } catch(e) {
    console.error(e);
    alert('답글 삭제 실패.');
  }
}

/* ── 4. 스크롤 네비게이션 숨김/표시 ── */
let lastScroll = 0;
const navbar   = document.getElementById('navbar');

window.addEventListener('scroll', () => {
  const cur = window.scrollY;
  if (Math.abs(cur - lastScroll) < 5) return;
  if (cur > lastScroll && cur > 100) navbar?.classList.add('nav-hidden');
  else navbar?.classList.remove('nav-hidden');
  lastScroll = cur;
});

document.addEventListener('mousemove', e => {
  if (e.clientY < 40) navbar?.classList.remove('nav-hidden');
  else if (e.clientY > 60 && window.scrollY > 100) navbar?.classList.add('nav-hidden');
});

/* ── 5. 카카오맵 초기화 (좌표 직접 사용) ── */
function initMap() {
  const container = document.getElementById('map');
  if (!container) return;

  const map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(37.4760, 126.7160),
    level: 10,
  });

  const markerImage = new kakao.maps.MarkerImage(
    'Picture/Nodamm_MapPoint.png',
    new kakao.maps.Size(80, 100),
    { offset: new kakao.maps.Point(40, 100) }
  );

  // ── 스팟 목록 (위경도 직접 지정) ──
  const spots = [
    { title: '구월동 로데오거리',    count: 0,   lat: 37.4519,           lng: 126.7316           },
    { title: '인하 문화의 거리',     count: 0,   lat: 37.4508,           lng: 126.6572           },
    { title: '주안역 주변',          count: 0,   lat: 37.4611,           lng: 126.6765           },
    { title: '청라 커널웨이',        count: 0,   lat: 37.5391,           lng: 126.6478           },
    { title: '계양 문화의 거리',     count: 0,   lat: 37.5378,           lng: 126.7384           },
    { title: '송도 인천대역',        count: 0,   lat: 37.3836,           lng: 126.6561           },
    { title: '부평 문화의 거리',     count: 124, lat: 37.49415397230344, lng: 126.72428100316051 },
    { title: '을왕리 해수욕장',      count: 0,   lat: 37.445826,         lng: 126.372846         },
    { title: '차이나타운',           count: 0,   lat: 37.476964,         lng: 126.619091         },
  ];

  spots.forEach(spot => {
    const latlng = new kakao.maps.LatLng(spot.lat, spot.lng);

    const marker = new kakao.maps.Marker({
      map,
      position: latlng,
      title: spot.title,
      image: markerImage,
    });

    const infowindow = new kakao.maps.InfoWindow({
      content: `<div style="padding:8px 12px;font-size:13px;font-weight:600;white-space:nowrap;line-height:1.8;border-radius:8px;">
        📍 ${spot.title}<br>
        <span style="color:#2d6a4f;font-size:12px;">🚬 수거량: <strong>${spot.count}개</strong></span>
      </div>`,
      removable: false,
    });

    let isPinned = false;
    kakao.maps.event.addListener(marker, 'mouseover', () => { if (!isPinned) infowindow.open(map, marker); });
    kakao.maps.event.addListener(marker, 'mouseout',  () => { if (!isPinned) infowindow.close(); });
    kakao.maps.event.addListener(marker, 'click', () => {
      isPinned = !isPinned;
      if (isPinned) {
        infowindow.open(map, marker);
        map.panTo(latlng);
      } else {
        infowindow.close();
      }
    });
  });

  // 지도 위 휠 → 페이지 스크롤 차단
  container.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
}

function waitForKakaoAndInit() {
  if (window.kakao && window.kakao.maps) initMap();
  else setTimeout(waitForKakaoAndInit, 100);
}

/* ── 6. 월별 활동 일정 ── */
let currentViewMonth = new Date().getMonth() + 1; // 현재 달 자동 설정

const scheduleByMonth = {
  1:  [{ date: '1월 10일 (토)',  time: '10:00', region: '남동구',  place: '남동구청 앞 광장' },
       { date: '1월 17일 (토)',  time: '10:00', region: '부평구',  place: '부평 문화의 거리' },
       { date: '1월 24일 (토)',  time: '10:00', region: '미추홀구', place: '주안역 1번 출구' }],
  2:  [{ date: '2월 7일 (토)',   time: '10:00', region: '연수구',  place: '스퀘어원 광장' },
       { date: '2월 14일 (토)',  time: '10:00', region: '서구',    place: '청라 커낼웨이' },
       { date: '2월 21일 (토)',  time: '10:00', region: '계양구',  place: '계양구청 광장' }],
  3:  [{ date: '3월 7일 (토)',   time: '10:00', region: '중구',    place: '차이나타운 입구' },
       { date: '3월 14일 (토)',  time: '10:00', region: '남동구',  place: '소래포구역 인근' },
       { date: '3월 21일 (토)',  time: '10:00', region: '부평구',  place: '부평역 테마거리' }],
  4:  [{ date: '4월 4일 (토)',   time: '10:00', region: '미추홀구', place: '인하대 후문 거리' },
       { date: '4월 11일 (토)',  time: '10:00', region: '연수구',  place: '송도 센트럴파크' },
       { date: '4월 18일 (토)',  time: '10:00', region: '서구',    place: '검단사거리역' }],
  5:  [{ date: '5월 16일 (토)',  time: '10:00', region: '남동구',  place: '남동구청 앞 광장' },
       { date: '5월 23일 (토)',  time: '10:00', region: '부평구',  place: '부평 문화의 거리 입구', active: true },
       { date: '5월 30일 (토)',  time: '10:00', region: '미추홀구', place: '주안역 1번 출구 앞' }],
  6:  [{ date: '6월 6일 (토)',   time: '10:00', region: '계양구',  place: '계양산 입구' },
       { date: '6월 13일 (토)',  time: '10:00', region: '중구',    place: '월미도 광장' },
       { date: '6월 20일 (토)',  time: '10:00', region: '연수구',  place: '연수역 광장' }],
  7:  [{ date: '7월 4일 (토)',   time: '10:00', region: '서구',    place: '가좌동 행정복지센터' },
       { date: '7월 11일 (토)',  time: '10:00', region: '남동구',  place: '구월 로데오 광장' },
       { date: '7월 18일 (토)',  time: '10:00', region: '부평구',  place: '굴포천역 삼각공원' }],
  8:  [{ date: '8월 1일 (토)',   time: '10:00', region: '미추홀구', place: '용현동 토지금고' },
       { date: '8월 8일 (토)',   time: '10:00', region: '계양구',  place: '작전역 광장' },
       { date: '8월 15일 (토)',  time: '10:00', region: '중구',    place: '동인천역 북광장' }],
  9:  [{ date: '9월 5일 (토)',   time: '10:00', region: '연수구',  place: '선학역 음식거리' },
       { date: '9월 12일 (토)',  time: '10:00', region: '서구',    place: '가정역 인근' },
       { date: '9월 19일 (토)',  time: '10:00', region: '남동구',  place: '만수역 광장' }],
  10: [{ date: '10월 3일 (토)',  time: '10:00', region: '부평구',  place: '산곡역 인근' },
       { date: '10월 10일 (토)', time: '10:00', region: '미추홀구', place: '석바위 시장' },
       { date: '10월 17일 (토)', time: '10:00', region: '계양구',  place: '계산역 인근' }],
  11: [{ date: '11월 7일 (토)',  time: '10:00', region: '중구',    place: '영종역 광장' },
       { date: '11월 14일 (토)', time: '10:00', region: '연수구',  place: '테크노파크역' },
       { date: '11월 21일 (토)', time: '10:00', region: '서구',    place: '검암역 광장' }],
  12: [{ date: '12월 5일 (토)',  time: '10:00', region: '남동구',  place: '서창동 중심상가' },
       { date: '12월 12일 (토)', time: '10:00', region: '부평구',  place: '부개역 인근' },
       { date: '12월 19일 (토)', time: '10:00', region: '미추홀구', place: '인천터미널역' }],
};

function renderSchedule() {
  const body      = document.getElementById('schedule-body');
  const monthText = document.getElementById('current-month');
  if (!body || !monthText) return;

  monthText.textContent = `2026년 ${currentViewMonth}월`;

  const data = scheduleByMonth[currentViewMonth] || [];
  body.innerHTML = data.map(item => `
    <tr class="${item.active ? 'active-row' : ''}">
      <td>${item.date}</td>
      <td>${item.time}</td>
      <td>${item.region}</td>
      <td>${item.place}</td>
    </tr>`).join('');
}

let isChangingMonth = false;
function changeMonth(diff) {
  if (isChangingMonth) return;
  isChangingMonth = true;

  const wrapper = document.getElementById('schedule-wrapper');
  if (!wrapper) { isChangingMonth = false; return; }

  const outX = diff > 0 ? '-40px' : '40px';
  wrapper.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
  wrapper.style.opacity    = '0';
  wrapper.style.transform  = `translateX(${outX})`;

  setTimeout(() => {
    currentViewMonth += diff;
    if (currentViewMonth < 1)  currentViewMonth = 12;
    if (currentViewMonth > 12) currentViewMonth = 1;
    renderSchedule();

    const inX = diff > 0 ? '40px' : '-40px';
    wrapper.style.transition = 'none';
    wrapper.style.transform  = `translateX(${inX})`;
    wrapper.style.opacity    = '0';

    requestAnimationFrame(() => requestAnimationFrame(() => {
      wrapper.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      wrapper.style.opacity    = '1';
      wrapper.style.transform  = 'translateX(0)';
      isChangingMonth = false;
    }));
  }, 220);
}

/* ── 7. 탭 전환 ── */
let statsAnimated  = false;
let mapInitialized = false;

window.switchTab = function(tabName) {
  // 탭 버튼 active
  document.querySelectorAll('.act-tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  const activeBtn = document.querySelector(`.act-tab[onclick="switchTab('${tabName}')"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-selected', 'true');
  }

  // 콘텐츠 전환
  ['info','schedule','spot','gallery'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.style.display = t === tabName ? 'block' : 'none';
  });

  // 스팟 탭: 지도 + 카운터
  if (tabName === 'spot') {
    if (!mapInitialized) { mapInitialized = true; waitForKakaoAndInit(); }
    if (!statsAnimated)  {
      statsAnimated = true;
      setTimeout(() => {
        countUp('s1', 124, '/10000');
        countUp('s2', 10, '');
        countUp('s3', 1, 'H');
        countUp('s4', 10, '');
      }, 200);
    }
  }
};

/* ── 8. 지원서 제출 (모달 폼) ── */
document.addEventListener('DOMContentLoaded', () => {
  setupBoardListener();

  const modalForm = document.getElementById('modalApplyForm');
  if (!modalForm) return;

  modalForm.addEventListener('submit', async e => {
    e.preventDefault();

    const name    = document.getElementById('m_userName')?.value?.trim();
    const age     = document.getElementById('m_userAge')?.value?.trim();
    const gender  = document.getElementById('m_userGender')?.value;
    const smoking = document.getElementById('m_userSmoking')?.value;
    const area    = document.getElementById('m_userArea')?.value;
    const message = document.getElementById('m_userMessage')?.value?.trim();

    if (!name || !age || !gender || !smoking || !area) {
      alert('필수 항목(*)을 모두 입력해주세요.');
      return;
    }

    const btn = document.getElementById('modalSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = '제출 중...'; }

    try {
      await addDoc(collection(db, 'applicants'), {
        name, age: Number(age), gender, smoking, area,
        message: message || '',
        date: new Date().toISOString(),
      });

      modalForm.style.display = 'none';
      const successMsg = document.getElementById('modalSuccessMsg');
      const successEl  = document.getElementById('modalSuccess');
      if (successMsg) successMsg.innerHTML = `<strong>${name}</strong>님의 지원이 접수되었습니다.<br>확인 후 연락드리겠습니다. 🌱`;
      if (successEl)  successEl.style.display = 'block';
    } catch(err) {
      console.error(err);
      alert('제출에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> 신청서 제출하기'; }
    }
  });
});

/* ── 전역 함수 노출 (type="module" 대응) ── */
window.openPostView     = openPostView;
window.closePostView    = closePostView;
window.filterPosts      = filterPosts;
window.filterRegion     = filterRegion;
window.addPost          = addPost;
window.openEditModal    = openEditModal;
window.closeEditModal   = closeEditModal;
window.submitEdit       = submitEdit;
window.openDeleteModal  = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.submitDelete     = submitDelete;
window.openReplyModal   = openReplyModal;
window.closeReplyModal  = closeReplyModal;
window.submitReply      = submitReply;
window.openDeleteReply  = openDeleteReply;
window.changeMonth      = changeMonth;

window.openWriteModal = function() {
  const modal = document.getElementById('writeModal');
  if (modal) { modal.style.display = 'block'; window.lenis?.stop(); }
};
window.closeWriteModal = function() {
  const modal = document.getElementById('writeModal');
  if (modal) { modal.style.display = 'none'; window.lenis?.start(); }
};

/* ── 초기 렌더링 ── */
renderPosts();
renderSchedule();
