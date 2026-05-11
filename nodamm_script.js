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

const statsObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      countUp('s1', 124, '/10000');
      countUp('s2', 10, '');
      countUp('s3', 1, 'H');
      countUp('s4', 15, '');
      statsObserver.disconnect();
    }
  });
}, { threshold: 0.3 });

const detailSection = document.getElementById('detail');
if (detailSection) statsObserver.observe(detailSection);

/* ── 3. 게시판 (Firebase Firestore 실시간 연동) ── */
const BADGE = {
  join: { label: '참여신청', cls: 'badge-join' },
  q: { label: '질문', cls: 'badge-q' },
  review: { label: '후기', cls: 'badge-review' },
};

// Firestore 연결 전 보여줄 기본 샘플 데이터
const defaultPosts = [
  { type: 'join', region: '부평구', title: '저도 함께하고 싶어요! 신청합니다 😊', date: '2026.07.01' },
  { type: 'q', region: '연수구', title: '봉사시간 인증은 어떻게 받나요?', date: '2026.06.29' },
  { type: 'join', region: '부평구', title: '부평 지역으로 신청하고 싶습니다!', date: '2026.06.27' },
  { type: 'q', region: '남동구', title: '장갑이나 집게는 제공되나요?', date: '2026.06.25' },
  { type: 'join', region: '남동구', title: '인천 남동구에서 팀장 맡고 싶습니다.', date: '2026.06.23' },
];

let firestorePosts = null; // null = 아직 로딩 중, [] = 로드됐지만 비어있음
let currentFilter = 'all';
let currentRegion = 'all';

function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function renderPosts() {
  const list = document.getElementById('board-list');
  const countEl = document.getElementById('post-count');
  if (!list || !countEl) return;

  // Firestore 데이터가 아직 없으면 샘플 사용
  const source = (firestorePosts !== null && firestorePosts.length > 0)
    ? firestorePosts
    : (firestorePosts === null ? defaultPosts : []);

  const filtered = source.filter(p => {
    const matchType = currentFilter === 'all' || p.type === currentFilter;
    const matchRegion = currentRegion === 'all' || p.region === currentRegion;
    return matchType && matchRegion;
  });

  countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    list.innerHTML = '<li class="empty-msg" style="padding:40px; text-align:center; color:#999; list-style:none;">일치하는 게시글이 없습니다. 첫 번째로 남겨보세요!</li>';
    return;
  }

  list.innerHTML = filtered.map(p => `
    <li class="board-item">
      <div class="item-left">
        <span class="badge ${BADGE[p.type]?.cls || 'badge-join'}">${BADGE[p.type]?.label || p.type}</span>
        <span class="item-region">[${p.region}]</span>
        <span class="item-title">${p.title}</span>
      </div>
      <span class="item-date">${p.date}</span>
    </li>
  `).join('');
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

// Firestore 실시간 리스너 (새 글 자동 반영)
function setupBoardListener() {
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    firestorePosts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type,
        region: data.region,
        title: data.title,
        date: formatDate(data.createdAt),
      };
    });
    renderPosts();
  }, (error) => {
    console.warn("Firestore 리스너 오류, 샘플 데이터로 표시합니다:", error);
    firestorePosts = null;
    renderPosts();
  });
}

async function addPost() {
  const typeEl = document.getElementById('post-type');
  const regionEl = document.getElementById('post-region');
  const titleEl = document.getElementById('post-title');

  if (!typeEl || !regionEl || !titleEl) return;

  const type = typeEl.value;
  const region = regionEl.value;
  const title = titleEl.value.trim();

  if (!title) return alert('내용을 입력해주세요.');

  const submitBtn = document.querySelector('.board-form .form-submit');
  if (submitBtn) submitBtn.disabled = true;

  try {
    await addDoc(collection(db, "posts"), {
      type,
      region,
      title,
      createdAt: serverTimestamp(),
    });
    titleEl.value = '';
  } catch (error) {
    console.error("게시글 등록 오류:", error);
    alert("게시글 등록에 실패했습니다. 다시 시도해주세요.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

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

/* ── 5. 카카오맵 초기화 ── */
function initMap() {
  const container = document.getElementById('map');
  if (!container || !window.kakao) return;

  // placeholder 제거 후 직접 맵 렌더
  container.innerHTML = '';
  container.style.height = '450px';
  container.style.borderRadius = 'var(--radius-lg)';
  container.style.overflow = 'hidden';

  const options = {
    center: new kakao.maps.LatLng(37.4566, 126.7052),
    level: 8
  };
  const map = new kakao.maps.Map(container, options);

  const positions = [
    { title: '부평 테마거리', latlng: new kakao.maps.LatLng(37.4919, 126.7241) },
    { title: '구월동 로데오', latlng: new kakao.maps.LatLng(37.4449, 126.7029) },
    { title: '주안역', latlng: new kakao.maps.LatLng(37.4646, 126.6795) },
    { title: '송도 센트럴파크', latlng: new kakao.maps.LatLng(37.3929, 126.6522) },
    { title: '청라 커낼웨이', latlng: new kakao.maps.LatLng(37.5374, 126.6469) },
  ];

  positions.forEach(pos => {
    const marker = new kakao.maps.Marker({
      map: map,
      position: pos.latlng,
      title: pos.title
    });

    const infowindow = new kakao.maps.InfoWindow({
      content: `<div style="padding:6px 10px; font-size:13px; font-weight:600; white-space:nowrap;">${pos.title}</div>`
    });

    kakao.maps.event.addListener(marker, 'mouseover', () => infowindow.open(map, marker));
    kakao.maps.event.addListener(marker, 'mouseout', () => infowindow.close());
  });
}

// SDK 비동기 로드 대응
if (window.kakao && window.kakao.maps) {
  kakao.maps.load(initMap);
} else {
  window.addEventListener('load', () => {
    if (window.kakao && window.kakao.maps) kakao.maps.load(initMap);
  });
}

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

function changeMonth(diff) {
  const wrapper = document.querySelector('.schedule-table-wrapper');
  if (!wrapper) return;

  wrapper.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
  const slideOutClass = diff > 0 ? 'slide-out-left' : 'slide-out-right';
  wrapper.classList.add(slideOutClass);

  setTimeout(() => {
    currentViewMonth += diff;
    if (currentViewMonth < 1) currentViewMonth = 12;
    if (currentViewMonth > 12) currentViewMonth = 1;

    renderSchedule();
    wrapper.classList.remove(slideOutClass);
    const slideInClass = diff > 0 ? 'slide-in-right' : 'slide-in-left';
    wrapper.classList.add(slideInClass);
  }, 300);
}

/* ── 7. 지원서 제출 (Firebase 연동) ── */
document.addEventListener('DOMContentLoaded', () => {

  // 게시판 Firestore 실시간 리스너 시작
  setupBoardListener();

  const applyForm = document.getElementById('applyForm');
  if (applyForm) {
    applyForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name    = document.getElementById('userName')?.value?.trim();
      const age     = document.getElementById('userAge')?.value?.trim();
      const gender  = document.getElementById('userGender')?.value;
      const smoking = document.getElementById('userSmoking')?.value;
      const area    = document.getElementById('userArea')?.value;
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
window.filterRegion = filterRegion;
window.addPost = addPost;
window.changeMonth = changeMonth;

// 초기 렌더링
renderPosts();
renderSchedule();