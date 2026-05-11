/* ── Firebase 통합 (Modular SDK v10) ── */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
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

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ── 0. Lenis Smooth Scroll 초기화 ── */
const lenis = new Lenis({
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

// html의 onclick="lenis.scrollTo(...)"에서 접근할 수 있도록 전역 노출
window.lenis = lenis;

// Anchor link smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = this.getAttribute('href');
    if (target === '#') return;
    lenis.scrollTo(target);
  });
});

/* ── 1. 스크롤 페이드인 ── */
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

/* ── 2. 숫자 카운터 애니메이션 ── */
function countUp(id, target, suffix) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = Math.ceil(target / 50);
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current.toLocaleString() + (suffix || '');
    if (current >= target) clearInterval(timer);
  }, 35);
}

// 통계 카운터는 switchTab('spot') 에서 실행됨


/* ── 3. 게시판 (Firebase Firestore - 이름/비번/내용/수정/삭제/답글/관리자) ── */
const MASTER_PW = '3141592';

const BADGE = {
  q: { label: '질문', cls: 'badge-q' },
  review: { label: '후기', cls: 'badge-review' },
};

let firestorePosts = null;
let currentFilter = 'all';
let currentRegion = 'all';
let pendingEditId = null;
let pendingDeleteId = null;
let pendingReplyId = null;

function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function renderPosts() {
  const list = document.getElementById('board-list');
  const countEl = document.getElementById('post-count');
  if (!list || !countEl) return;

  const source = firestorePosts ?? [];
  const filtered = source.filter(p => {
    const matchType = currentFilter === 'all' || p.type === currentFilter;
    const matchRegion = currentRegion === 'all' || p.region === currentRegion;
    return matchType && matchRegion;
  });

  countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    list.innerHTML = '<li style="padding:40px;text-align:center;color:#999;list-style:none;">첫 번째 글을 남겨보세요!</li>';
    return;
  }

  list.innerHTML = filtered.map(p => {
    const repliesHtml = (p.replies || []).map((r, ri) => `
      <div class="reply-item">
        <span class="reply-author">↳ ${r.author}</span>
        <span>${r.content}</span>
        <span class="reply-date">${r.date}</span>
        <button class="reply-del" onclick="openDeleteReply('${p.id}',${ri})">삭제</button>
      </div>`).join('');

    const replyBtn = p.type === 'q'
      ? `<button class="reply-btn" onclick="openReplyModal('${p.id}')">💬 답글</button>` : '';

    return `
      <li class="board-item" style="flex-direction:column;align-items:flex-start;gap:6px;">
        <div style="display:flex;align-items:center;gap:6px;width:100%;justify-content:space-between;">
          <div class="item-left">
            <span class="badge ${BADGE[p.type]?.cls}">${BADGE[p.type]?.label}</span>
            <span class="item-region">[${p.region}]</span>
            <span class="item-author" style="font-weight:600;font-size:13px;color:var(--green);">${p.author}</span>
            <span class="item-title">${p.title}</span>
          </div>
          <div class="post-actions">
            <span class="item-date" style="font-size:12px;color:var(--muted);">${p.date}</span>
            ${replyBtn}
            <button class="action-btn" onclick="openEditModal('${p.id}','${p.title.replace(/'/g, "\\'")}')">수정</button>
            <button class="action-btn del" onclick="openDeleteModal('${p.id}')">삭제</button>
          </div>
        </div>
        ${repliesHtml ? `<div class="reply-list">${repliesHtml}</div>` : ''}
      </li>`;
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
  onSnapshot(q, (snapshot) => {
    firestorePosts = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        type: d.type, region: d.region,
        author: d.author || '익명',
        title: d.title,
        pw: d.pw || '',
        replies: d.replies || [],
        date: formatDate(d.createdAt),
      };
    });
    renderPosts();
  }, (err) => {
    console.warn('Firestore 오류:', err);
    firestorePosts = [];
    renderPosts();
  });
}

// 글 등록
async function addPost() {
  const author = document.getElementById('post-author')?.value?.trim();
  const pw = document.getElementById('post-pw')?.value?.trim();
  const type = document.getElementById('post-type')?.value;
  const region = document.getElementById('post-region')?.value;
  const title = document.getElementById('post-title')?.value?.trim();

  if (!author) return alert('이름을 입력해주세요.');
  if (!pw) return alert('비밀번호를 입력해주세요.');
  if (!title) return alert('내용을 입력해주세요.');

  const btn = document.querySelector('.board-write-form .form-submit');
  if (btn) btn.disabled = true;

  try {
    await addDoc(collection(db, 'posts'), {
      type, region, author, title, pw,
      replies: [],
      createdAt: serverTimestamp(),
    });
    document.getElementById('post-author').value = '';
    document.getElementById('post-pw').value = '';
    document.getElementById('post-title').value = '';
  } catch (e) {
    console.error(e);
    alert('등록 실패. 다시 시도해주세요.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// 수정 모달
function openEditModal(id, content) {
  pendingEditId = id;
  document.getElementById('edit-content').value = content;
  document.getElementById('edit-pw').value = '';
  document.getElementById('editModal').style.display = 'flex';
}
function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  pendingEditId = null;
}
async function submitEdit() {
  const pw = document.getElementById('edit-pw').value.trim();
  const content = document.getElementById('edit-content').value.trim();
  if (!pw || !content) return alert('비밀번호와 내용을 입력해주세요.');

  const post = firestorePosts.find(p => p.id === pendingEditId);
  if (!post) return;

  if (pw !== MASTER_PW && pw !== post.pw) return alert('비밀번호가 맞지 않습니다.');

  try {
    const { doc: fsDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    await updateDoc(fsDoc(db, 'posts', pendingEditId), { title: content });
    closeEditModal();
  } catch (e) {
    console.error(e);
    alert('수정 실패.');
  }
}

// 삭제 모달
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
    const { doc: fsDoc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    await deleteDoc(fsDoc(db, 'posts', pendingDeleteId));
    closeDeleteModal();
  } catch (e) {
    console.error(e);
    alert('삭제 실패.');
  }
}

// 답글 모달 (질문 글 전용)
function openReplyModal(id) {
  pendingReplyId = id;
  document.getElementById('reply-author').value = '';
  document.getElementById('reply-pw').value = '';
  document.getElementById('reply-content').value = '';
  document.getElementById('replyModal').style.display = 'flex';
}
function closeReplyModal() {
  document.getElementById('replyModal').style.display = 'none';
  pendingReplyId = null;
}
async function submitReply() {
  const author = document.getElementById('reply-author').value.trim();
  const pw = document.getElementById('reply-pw').value.trim();
  const content = document.getElementById('reply-content').value.trim();
  if (!author || !pw || !content) return alert('모든 항목을 입력해주세요.');

  const post = firestorePosts.find(p => p.id === pendingReplyId);
  if (!post) return;

  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  const newReply = { author, pw, content, date };

  try {
    const { doc: fsDoc, updateDoc, arrayUnion } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    await updateDoc(fsDoc(db, 'posts', pendingReplyId), { replies: arrayUnion(newReply) });
    closeReplyModal();
  } catch (e) {
    console.error(e);
    alert('답글 등록 실패.');
  }
}

// 답글 삭제
async function openDeleteReply(postId, replyIdx) {
  const pw = prompt('비밀번호를 입력하세요 (작성자 비번 또는 마스터 비번):');
  if (!pw) return;

  const post = firestorePosts.find(p => p.id === postId);
  if (!post) return;
  const reply = post.replies[replyIdx];
  if (!reply) return;

  if (pw !== MASTER_PW && pw !== reply.pw) return alert('비밀번호가 맞지 않습니다.');

  const newReplies = post.replies.filter((_, i) => i !== replyIdx);
  try {
    const { doc: fsDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    await updateDoc(fsDoc(db, 'posts', postId), { replies: newReplies });
  } catch (e) {
    console.error(e);
    alert('답글 삭제 실패.');
  }
}

// 모달 배경 클릭 닫기
['editModal', 'deleteModal', 'replyModal'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', function (e) {
    if (e.target === this) this.style.display = 'none';
  });
});


/* ── 4. 스크롤 네비게이션 숨김/표시 ── */
let lastScroll = 0;
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  const currentScroll = window.scrollY;
  if (Math.abs(currentScroll - lastScroll) < 5) return;

  if (currentScroll > lastScroll && currentScroll > 100) {
    navbar?.classList.add('nav-hidden');
  } else {
    navbar?.classList.remove('nav-hidden');
  }
  lastScroll = currentScroll;
});


// type="module"은 defer처럼 동작하므로 SDK가 이미 로드된 상태
// window.kakao가 있으면 바로 실행, 없으면 폴링으로 대기
/* ── 6. 월별 활동 일정 ── */
let currentViewMonth = 5;

const scheduleByMonth = {
  1: [{ date: '1월 10일 (토)', time: '10:00', region: '남동구', place: '남동구청 앞 광장' }, { date: '1월 17일 (토)', time: '10:00', region: '부평구', place: '부평 문화의 거리' }, { date: '1월 24일 (토)', time: '10:00', region: '미추홀구', place: '주안역 1번 출구' }],
  2: [{ date: '2월 7일 (토)', time: '10:00', region: '연수구', place: '스퀘어원 광장' }, { date: '2월 14일 (토)', time: '10:00', region: '서구', place: '청라 커낼웨이' }, { date: '2월 21일 (토)', time: '10:00', region: '계양구', place: '계양구청 광장' }],
  3: [{ date: '3월 7일 (토)', time: '10:00', region: '중구', place: '차이나타운 입구' }, { date: '3월 14일 (토)', time: '10:00', region: '남동구', place: '소래포구역 인근' }, { date: '3월 21일 (토)', time: '10:00', region: '부평구', place: '부평역 테마거리' }],
  4: [{ date: '4월 4일 (토)', time: '10:00', region: '미추홀구', place: '인하대 후문 거리' }, { date: '4월 11일 (토)', time: '10:00', region: '연수구', place: '송도 센트럴파크' }, { date: '4월 18일 (토)', time: '10:00', region: '서구', place: '검단사거리역' }],
  5: [{ date: '5월 16일 (토)', time: '10:00', region: '남동구', place: '남동구청 앞 광장' }, { date: '5월 23일 (토)', time: '10:00', region: '부평구', place: '부평 문화의 거리 입구', active: true }, { date: '5월 30일 (토)', time: '10:00', region: '미추홀구', place: '주안역 1번 출구 앞' }],
  6: [{ date: '6월 6일 (토)', time: '10:00', region: '계양구', place: '계양산 입구' }, { date: '6월 13일 (토)', time: '10:00', region: '중구', place: '월미도 광장' }, { date: '6월 20일 (토)', time: '10:00', region: '연수구', place: '연수역 광장' }],
  7: [{ date: '7월 4일 (토)', time: '10:00', region: '서구', place: '가좌동 행정복지센터' }, { date: '7월 11일 (토)', time: '10:00', region: '남동구', place: '구월 로데오 광장' }, { date: '7월 18일 (토)', time: '10:00', region: '부평구', place: '굴포천역 삼각공원' }],
  8: [{ date: '8월 1일 (토)', time: '10:00', region: '미추홀구', place: '용현동 토지금고' }, { date: '8월 8일 (토)', time: '10:00', region: '계양구', place: '작전역 광장' }, { date: '8월 15일 (토)', time: '10:00', region: '중구', place: '동인천역 북광장' }],
  9: [{ date: '9월 5일 (토)', time: '10:00', region: '연수구', place: '선학역 음식거리' }, { date: '9월 12일 (토)', time: '10:00', region: '서구', place: '가정역 인근' }, { date: '9월 19일 (토)', time: '10:00', region: '남동구', place: '만수역 광장' }],
  10: [{ date: '10월 3일 (토)', time: '10:00', region: '부평구', place: '산곡역 인근' }, { date: '10월 10일 (토)', time: '10:00', region: '미추홀구', place: '석바위 시장' }, { date: '10월 17일 (토)', time: '10:00', region: '계양구', place: '계산역 인근' }],
  11: [{ date: '11월 7일 (토)', time: '10:00', region: '중구', place: '영종역 광장' }, { date: '11월 14일 (토)', time: '10:00', region: '연수구', place: '테크노파크역' }, { date: '11월 21일 (토)', time: '10:00', region: '서구', place: '검암역 광장' }],
  12: [{ date: '12월 5일 (토)', time: '10:00', region: '남동구', place: '서창동 중심상가' }, { date: '12월 12일 (토)', time: '10:00', region: '부평구', place: '부개역 인근' }, { date: '12월 19일 (토)', time: '10:00', region: '미추홀구', place: '인천터미널역' }]
};

function renderSchedule() {
  const body = document.getElementById('schedule-body');
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
    </tr>
  `).join('');
}

let isChangingMonth = false;
function changeMonth(diff) {
  if (isChangingMonth) return;
  isChangingMonth = true;
  const wrapper = document.getElementById('schedule-wrapper');
  const monthEl = document.getElementById('current-month');
  if (!wrapper) { isChangingMonth = false; return; }

  wrapper.style.opacity = '0';
  setTimeout(() => {
    currentViewMonth += diff;
    if (currentViewMonth < 1) currentViewMonth = 12;
    if (currentViewMonth > 12) currentViewMonth = 1;
    renderSchedule();
    wrapper.style.opacity = '1';
    isChangingMonth = false;
  }, 250);
}

/* ── 7. 지원서 제출 (Firebase 연동) ── */
document.addEventListener('DOMContentLoaded', () => {

  // 게시판 Firestore 실시간 리스너 시작
  setupBoardListener();

  const applyForm = document.getElementById('applyForm');
  if (applyForm) {
    applyForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('userName')?.value?.trim();
      const age = document.getElementById('userAge')?.value?.trim();
      const gender = document.getElementById('userGender')?.value;
      const smoking = document.getElementById('userSmoking')?.value;
      const area = document.getElementById('userArea')?.value;
      const message = document.getElementById('userMessage')?.value?.trim();

      if (!name || !age || !gender || !smoking || !area) {
        alert('필수 항목(*)을 모두 입력해주세요.');
        return;
      }

      const submitBtn = applyForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const userData = {
        name,
        age: Number(age),
        gender,
        smoking,
        area,
        message: message || '',
        date: new Date().toISOString(),
      };

      try {
        await addDoc(collection(db, "applicants"), userData);
        alert(`${name}님, 2026 노담 서포터즈 지원이 완료되었습니다!\n확인 후 연락드리겠습니다. 🌱`);
        applyForm.reset();
      } catch (error) {
        console.error("Firebase Error:", error);
        alert("제출에 실패했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
});

// 전역 함수 노출 (type="module" 환경 대응)
window.filterPosts = filterPosts;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.submitEdit = submitEdit;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.submitDelete = submitDelete;
window.openReplyModal = openReplyModal;
window.closeReplyModal = closeReplyModal;
window.submitReply = submitReply;
window.openDeleteReply = openDeleteReply;
window.filterRegion = filterRegion;
window.addPost = addPost;
window.changeMonth = changeMonth;

// 탭 전환 함수
let statsAnimated = false;
let mapInitialized = false;

window.switchTab = function (tabName) {
  // 탭 버튼 active 처리
  document.querySelectorAll('.act-tab').forEach(t => t.classList.remove('active'));
  const activeBtn = document.querySelector(`.act-tab[onclick="switchTab('${tabName}')"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // 콘텐츠 전환
  ['info', 'schedule', 'spot', 'gallery'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.style.display = t === tabName ? 'block' : 'none';
  });

  // 스팟 탭 - 지도 초기화 & 통계 카운터
  if (tabName === 'spot') {
    if (!mapInitialized) {
      mapInitialized = true;
      waitForKakaoAndInit();
    }
    if (!statsAnimated) {
      statsAnimated = true;
      setTimeout(() => {
        countUp('s1', 124, '/10000');
        countUp('s2', 10, '');
        countUp('s3', 1, '');
        countUp('s4', 10, '');
      }, 200);
    }
  }
};

// 초기 렌더링
renderPosts();
renderSchedule();


/* 5. 카카오맵 초기화 - 주소로 좌표 자동 변환 */
function initMap() {
  const container = document.getElementById('map');
  if (!container) return;

  const options = {
    center: new kakao.maps.LatLng(37.4566, 126.7052),
    level: 9
  };
  const map = new kakao.maps.Map(container, options);

  // 커스텀 마커 이미지 (Nodamm_MapPoint 사용)
  const markerImageSrc = '/Picture/Nodamm_MapPoint.png';
  const markerImageSize = new kakao.maps.Size(47, 47);
  const markerImageOption = { offset: new kakao.maps.Point(23, 47) };
  const markerImage = new kakao.maps.MarkerImage(markerImageSrc, markerImageSize, markerImageOption);

  // 주소 기반 스팟 목록 (주소로 좌표 자동 검색)
  const spots = [
    { title: '구월동 로데오거리', count: 0, address: '인천 남동구 구월동 1409-25' },
    { title: '인하 문화의 거리', count: 0, address: '인천 미추홀구 경인남길30번길 45-1' },
    { title: '주안역 주변', count: 0, address: '인천 미추홀구 주안동 188' },
    { title: '청라 커널웨이', count: 0, address: '인천 서구 청라동 162-12' },
    { title: '계양 문화의 거리', count: 0, address: '인천 계양구 작전동 935' },
    { title: '송도 인천대역', count: 0, address: '인천 연수구 송도동 8-32' },
    { title: '동인천 북광장', count: 124, address: '인천광역시 동구 화도진로 53' },
  ];

  const geocoder = new kakao.maps.services.Geocoder();

  spots.forEach(spot => {
    geocoder.addressSearch(spot.address, (result, status) => {
      if (status !== kakao.maps.services.Status.OK) {
        console.warn(`주소 변환 실패: ${spot.address}`);
        return;
      }

      const latlng = new kakao.maps.LatLng(result[0].y, result[0].x);

      const marker = new kakao.maps.Marker({
        map: map,
        position: latlng,
        title: spot.title,
        image: markerImage
      });

      const infowindow = new kakao.maps.InfoWindow({
        content: `<div style="padding:8px 12px; font-size:13px; font-weight:600; white-space:nowrap; line-height:1.8; border-radius:8px;">
          📍 ${spot.title}<br>
          <span style="color:#2d6a4f; font-size:12px;">🚬 수거량: <strong>${spot.count}개</strong></span>
        </div>`,
        removable: false
      });

      let isPinned = false;

      kakao.maps.event.addListener(marker, 'mouseover', () => {
        if (!isPinned) infowindow.open(map, marker);
      });

      kakao.maps.event.addListener(marker, 'mouseout', () => {
        if (!isPinned) infowindow.close();
      });

      kakao.maps.event.addListener(marker, 'click', () => {
        if (isPinned) {
          isPinned = false;
          infowindow.close();
        } else {
          isPinned = true;
          infowindow.open(map, marker);
        }
      });
    });
  });
}

// 지도 위에서 휠할 때만 페이지 스크롤 차단
document.addEventListener('DOMContentLoaded', () => {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  mapContainer.addEventListener('wheel', (e) => {
    e.stopPropagation();
  }, { passive: true });
});

// 카카오 SDK 로드 대기 후 실행
function waitForKakaoAndInit() {
  if (window.kakao && window.kakao.maps) {
    initMap();
  } else {
    setTimeout(waitForKakaoAndInit, 100);
  }
}
// waitForKakaoAndInit은 switchTab(spot)에서 호출됨

/* 모달 지원서 Firebase 제출 */
document.addEventListener('DOMContentLoaded', () => {
  const modalForm = document.getElementById('modalApplyForm');
  if (!modalForm) return;

  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('m_userName')?.value?.trim();
    const age = document.getElementById('m_userAge')?.value?.trim();
    const gender = document.getElementById('m_userGender')?.value;
    const smoking = document.getElementById('m_userSmoking')?.value;
    const area = document.getElementById('m_userArea')?.value;
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
      const successEl = document.getElementById('modalSuccess');
      const successMsg = document.getElementById('modalSuccessMsg');
      if (successMsg) successMsg.innerHTML = `<strong>${name}</strong>님의 지원이 접수되었습니다.<br>확인 후 연락드리겠습니다. 🌱`;
      if (successEl) successEl.style.display = 'block';

    } catch (err) {
      console.error(err);
      alert('제출에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> 신청서 제출하기'; }
    }
  });
});
