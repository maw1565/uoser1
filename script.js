import { db, storeConfig } from './config.js';
import { collection, onSnapshot, addDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let specialistsCache = [];
let bookingsCache = [];
let globalTimesCache = [];
let currentWhatsapp = storeConfig.whatsapp || '9647762209987';

function normalizeWhatsapp(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function normalizeInstagramUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const username = trimmed.replace(/^@/, '').replace(/^instagram\.com\//i, '').replace(/^www\.instagram\.com\//i, '');
  return `https://instagram.com/${username}`;
}

function isSlotBooked(specialist, dateValue, timeValue) {
  if (!specialist || !dateValue || !timeValue) return false;
  return bookingsCache.some(booking => {
    const sameSpecialist = booking.specialistId === specialist.id ||
      booking.specialist === specialist.name ||
      String(booking.service || '').includes(`مع ${specialist.name}`);
    const sameDate = booking.dateValue === dateValue || String(booking.date || '').includes(dateValue);
    const sameTime = booking.timeValue === timeValue || String(booking.date || '').includes(timeValue);
    return sameSpecialist && sameDate && sameTime;
  });
}

function renderSpecialistTimes() {
  const timeOptionsContainer = document.getElementById('time-options');
  if (!timeOptionsContainer) return;

  const specialist = specialistsCache.find(item => item.id === bookingData.specialistId);
  const times = specialist && Array.isArray(specialist.times) && specialist.times.length
    ? specialist.times
    : globalTimesCache;

  bookingData.time = "";
  document.getElementById("summary-time").textContent = "---";
  document.querySelector("#step-3 .next-btn").disabled = true;

  if (!specialist) {
    timeOptionsContainer.innerHTML = '<div class="booking-note">اختاري الموظفة أولا</div>';
    return;
  }

  if (times.length === 0) {
    timeOptionsContainer.innerHTML = '<div class="booking-note">لا توجد أوقات متاحة لهذه الموظفة</div>';
    return;
  }

  const bookedTimes = times.filter(time => isSlotBooked(specialist, bookingData.date, time));
  const conflictMessage = bookedTimes.length > 0
    ? `<div class="booking-conflict-message">${specialist.name} محجوزة في هذا الوقت، اختاري وقت آخر</div>`
    : '';

  timeOptionsContainer.innerHTML = conflictMessage + times.map(time => {
    const booked = isSlotBooked(specialist, bookingData.date, time);
    return `
      <button type="button" class="time-slot ${booked ? 'booked' : ''}" data-value="${time}" aria-disabled="${booked ? 'true' : 'false'}" ${booked ? 'disabled' : ''}>
        <span>${time}</span>
        ${booked ? '<small>محجوز - اختاري وقت آخر</small>' : ''}
      </button>
    `;
  }).join('');

  document.querySelectorAll("#time-options .time-slot:not(.booked)").forEach(opt => {
    opt.addEventListener("click", () => {
      document.querySelectorAll("#time-options .time-slot").forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");
      bookingData.time = opt.getAttribute("data-value");
      document.getElementById("summary-time").textContent = bookingData.time;
      document.querySelector("#step-3 .next-btn").disabled = !(bookingData.date && bookingData.time);
    });
  });
}

// Fetch settings
onSnapshot(doc(db, "settings", "general"), (docSnap) => {
  if (docSnap.exists()) {
    const data = docSnap.data();
    if(data.name) document.querySelector('h1').textContent = data.name;
    if(data.whatsapp) {
      currentWhatsapp = normalizeWhatsapp(data.whatsapp);
      document.querySelector('.header-whatsapp').href = `https://wa.me/${currentWhatsapp}`;
    }
    const instagramUrl = normalizeInstagramUrl(data.instagram);
    const instagramLink = document.getElementById('instagram-link');
    if (instagramLink) {
      instagramLink.href = instagramUrl || '#';
      instagramLink.style.display = instagramUrl ? 'flex' : 'none';
    }
    if(data.logo) document.getElementById('site-logo').src = data.logo;
  }
});

// Fetch Banners
onSnapshot(collection(db, "banners"), (snapshot) => {
  const container = document.getElementById('banner-slider');
  if(!container) return;
  const banners = snapshot.docs.map(doc => doc.data()).filter(b => b.status === 'نشط');
  
  if (banners.length === 0) {
    container.innerHTML = '<div style="padding: 40px; text-align: center; color: #888;">لا توجد عروض حالياً</div>';
    return;
  }

  container.innerHTML = banners.map((b, i) => `
    <img src="${b.image}" alt="${b.title}" class="slide ${i === 0 ? 'active' : 'next'}" />
  `).join('');
});

// Fetch Works (Services)
onSnapshot(collection(db, "services"), (snapshot) => {
  const homeGallery = document.getElementById('home-gallery');
  const allWorksGallery = document.getElementById('all-works-gallery');
  const wizardServices = document.getElementById('services-options');
  const services = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
  
  const generateWorkHtml = (s) => `
    <div class="gallery-item work-item" data-title="${s.name}" data-price="${s.price.toLocaleString()} د.ع" data-img="${s.image}" style="cursor: pointer;">
      <img src="${s.image}" alt="${s.name}" />
      <div class="item-details">
        <h3>${s.name}</h3>
        <span class="price">${s.price.toLocaleString()} د.ع</span>
      </div>
    </div>
  `;

  if(homeGallery) homeGallery.innerHTML = services.slice(0, 4).map(generateWorkHtml).join('');
  if(allWorksGallery) allWorksGallery.innerHTML = services.map(generateWorkHtml).join('');

  if(wizardServices) {
    wizardServices.innerHTML = services.map(s => `
      <div class="option-card" data-value="${s.name}" data-price="${s.price}">
        <div class="option-info">
          <h4>${s.name}</h4>
        </div>
        <div class="option-price">${s.price.toLocaleString()} د.ع</div>
      </div>
    `).join('');
    
    // Reattach Step 1 options
    const step1Next = document.querySelector("#step-1 .next-btn");
    document.querySelectorAll("#services-options .option-card").forEach(opt => {
      opt.addEventListener("click", () => {
        opt.classList.toggle("selected");
        
        bookingData.services = [];
        let totalPrice = 0;
        
        document.querySelectorAll("#services-options .option-card.selected").forEach(selectedOpt => {
          bookingData.services.push(selectedOpt.getAttribute("data-value"));
          totalPrice += parseInt(selectedOpt.getAttribute("data-price"));
        });
        
        const serviceNames = bookingData.services.length > 0 ? bookingData.services.join(" + ") : "---";
        document.getElementById("summary-service").textContent = serviceNames;
        document.getElementById("summary-price").textContent = totalPrice > 0 ? totalPrice.toLocaleString() + " د.ع" : "---";
        
        step1Next.disabled = bookingData.services.length === 0;
      });
    });
  }

  attachWorkModalListeners();
});

// Fetch Specialists
onSnapshot(collection(db, "specialists"), (snapshot) => {
  const wizardSpecialists = document.getElementById('specialists-options');
  if(!wizardSpecialists) return;
  specialistsCache = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));

  wizardSpecialists.innerHTML = specialistsCache.map(s => {
    const isLeave = s.onLeave ? true : false;
    const times = Array.isArray(s.times) ? s.times : [];
    return `
    <div class="option-card ${isLeave ? 'disabled' : ''}" data-id="${s.id}" data-value="${s.name}" ${isLeave ? 'style="opacity: 0.5; pointer-events: none; cursor: not-allowed;"' : ''}>
      <div class="option-info" style="display: flex; align-items: center; gap: 10px;">
        <img src="${s.image || ''}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; filter: ${isLeave ? 'grayscale(100%)' : 'none'};" />
        <div>
          <h4>${s.name}</h4>
          <span>${times.length ? times.length + ' أوقات متاحة' : 'لا توجد أوقات خاصة'}</span>
          ${isLeave ? '<span style="color: #ff5252; font-size: 0.8em; font-weight: bold;">مجازة</span>' : ''}
        </div>
      </div>
    </div>
  `}).join('');

  // Reattach Step 2 options
  const step2Next = document.querySelector("#step-2 .next-btn");
  const specialistOptions = document.querySelectorAll("#specialists-options .option-card:not(.disabled)");
  specialistOptions.forEach(opt => {
    opt.addEventListener("click", () => {
      specialistOptions.forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");
      
      bookingData.specialist = opt.getAttribute("data-value");
      bookingData.specialistId = opt.getAttribute("data-id");
      document.getElementById("summary-specialist").textContent = bookingData.specialist;
      renderSpecialistTimes();
      
      step2Next.disabled = false;
    });
  });
});

onSnapshot(collection(db, "bookings"), (snapshot) => {
  bookingsCache = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
  renderSpecialistTimes();
});

// Fetch Products
onSnapshot(collection(db, "products"), (snapshot) => {
  const container = document.getElementById('home-products');
  if(!container) return;
  const products = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
  
  if (products.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">لا توجد منتجات حالياً</div>';
    return;
  }

  container.innerHTML = products.map(p => `
    <div class="product-card">
      <img src="${p.image}" alt="${p.name}" />
      <h4>${p.name}</h4>
      <span class="price">${p.price.toLocaleString()} د.ع</span>
      <button class="action-btn add-to-cart-btn" data-name="${p.name}" data-price="${p.price}" data-img="${p.image}">إضافة للسلة</button>
    </div>
  `).join('');

  attachCartListeners();
});

// Fetch Times
onSnapshot(collection(db, "times"), (snapshot) => {
  globalTimesCache = snapshot.docs.map(doc => doc.data().value).filter(Boolean);
  renderSpecialistTimes();
});

// Fetch Dates
onSnapshot(query(collection(db, "dates"), orderBy("createdAt", "asc")), (snapshot) => {
  const dateOptionsContainer = document.getElementById('date-options');
  if(!dateOptionsContainer) return;
  const dates = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
  
  dateOptionsContainer.innerHTML = dates.map(d => `
    <div class="time-slot" data-value="${d.value}">
      <span>${d.name}</span>
    </div>
  `).join('');

  const dateOptions = document.querySelectorAll("#date-options .time-slot");
  dateOptions.forEach(opt => {
    opt.addEventListener("click", () => {
      dateOptions.forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");
      
      bookingData.date = opt.getAttribute("data-value");
      document.getElementById("summary-date").textContent = bookingData.date;
      renderSpecialistTimes();
      
      if (bookingData.date && bookingData.time) {
        document.querySelector("#step-3 .next-btn").disabled = false;
      }
    });
  });
});

const navItems = document.querySelectorAll(".nav-item");
const toast = document.getElementById("toast");
const actionBtns = document.querySelectorAll(".action-btn");
let toastTimeout;

function showToast(message) {
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add("show");

  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

navItems.forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();

    // Prevent action if already active
    if (item.classList.contains("active")) return;

    // Change active state
    navItems.forEach((nav) => nav.classList.remove("active"));
    item.classList.add("active");

    // Handle sections
    const targetId = item.getAttribute("data-target");
    if (targetId) {
      document.querySelectorAll(".page-section").forEach((sec) => {
        sec.classList.remove("active");
      });
      document.getElementById(targetId).classList.add("active");
    }
  });
});

let cart = [];
const cartBadge = document.getElementById("cart-badge");
const cartItemsContainer = document.getElementById("cart-items");
const cartTotal = document.querySelector(".cart-total");
const cartTotalPrice = document.getElementById("cart-total-price");
const addToCartBtns = document.querySelectorAll(".add-to-cart-btn");

function updateCartUI() {
  // Update Badge
  cartBadge.textContent = cart.length;
  
  if (cart.length === 0) {
    cartItemsContainer.innerHTML = '<p class="empty-cart-msg">السلة فارغة حالياً</p>';
    cartTotal.style.display = "none";
    return;
  }
  
  cartTotal.style.display = "block";
  cartItemsContainer.innerHTML = "";
  let total = 0;
  
  cart.forEach((item, index) => {
    total += parseInt(item.price);
    const cartItem = document.createElement("div");
    cartItem.className = "cart-item";
    cartItem.innerHTML = `
      <img src="${item.img}" alt="${item.name}">
      <div class="cart-item-details">
        <h4>${item.name}</h4>
        <span class="price">${parseInt(item.price).toLocaleString()} د.ع</span>
      </div>
      <button class="cart-item-remove" data-index="${index}">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;
    cartItemsContainer.appendChild(cartItem);
  });
  
  cartTotalPrice.textContent = total.toLocaleString();
  
  // Attach remove events
  document.querySelectorAll(".cart-item-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.currentTarget.getAttribute("data-index"));
      cart.splice(index, 1);
      updateCartUI();
      showToast("تم الحذف من السلة");
    });
  });
}

function attachCartListeners() {
  const addToCartBtns = document.querySelectorAll(".add-to-cart-btn");
  addToCartBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const name = btn.getAttribute("data-name");
      const price = btn.getAttribute("data-price");
      const img = btn.getAttribute("data-img");
      
      cart.push({ name, price, img });
      updateCartUI();
      showToast("تمت الإضافة للسلة");
    });
  });
}

function attachWorkModalListeners() {
  document.querySelectorAll('.work-item').forEach(item => {
    item.addEventListener('click', () => {
      const title = item.getAttribute('data-title');
      const price = item.getAttribute('data-price');
      const img = item.getAttribute('data-img');
      const desc = item.getAttribute('data-desc');

      workModalTitle.textContent = title;
      workModalPrice.textContent = price;
      workModalImg.src = img;
      if(workModalDesc) workModalDesc.textContent = desc || '';

      workModal.style.display = 'flex';
    });
  });
}

let pendingOrder = null;
const checkoutBtn = document.querySelector(".checkout-btn");
const pendingOrderContainer = document.getElementById("pending-order-container");
const currentCartContainer = document.getElementById("current-cart-container");
const checkoutFormContainer = document.getElementById("checkout-form-container");
const confirmCheckoutBtn = document.getElementById("confirm-checkout-btn");
const cancelCheckoutBtn = document.getElementById("cancel-checkout-btn");
const checkoutName = document.getElementById("checkout-name");
const checkoutAddress = document.getElementById("checkout-address");
const checkoutPhone = document.getElementById("checkout-phone");
const pendingOrderItems = document.getElementById("pending-order-items");
const skipPendingBtn = document.getElementById("skip-pending-btn");

function showPendingOrder() {
  if (pendingOrder && pendingOrder.length > 0) {
    pendingOrderContainer.style.display = "block";
    currentCartContainer.style.display = "none";
    if (checkoutFormContainer) checkoutFormContainer.style.display = "none";
    
    let itemsHtml = "";
    let total = 0;
    pendingOrder.forEach(item => {
      itemsHtml += `<div style="display: flex; justify-content: space-between; border-bottom: 1px solid #444; padding: 10px 0;">
        <span>${item.name}</span>
        <span style="color: #d4af37;">${parseInt(item.price).toLocaleString()} د.ع</span>
      </div>`;
      total += parseInt(item.price);
    });
    itemsHtml += `<div style="display: flex; justify-content: space-between; padding-top: 10px; font-weight: bold; margin-top: 5px;">
      <span>الإجمالي:</span>
      <span style="color: #d4af37;">${total.toLocaleString()} د.ع</span>
    </div>`;
    
    pendingOrderItems.innerHTML = itemsHtml;
  } else {
    pendingOrderContainer.style.display = "none";
    currentCartContainer.style.display = "block";
    if (checkoutFormContainer) checkoutFormContainer.style.display = "none";
  }
}

if (checkoutBtn) {
  checkoutBtn.addEventListener("click", () => {
    if (cart.length === 0) return;
    currentCartContainer.style.display = "none";
    checkoutFormContainer.style.display = "block";
  });
}

if (cancelCheckoutBtn) {
  cancelCheckoutBtn.addEventListener("click", () => {
    checkoutFormContainer.style.display = "none";
    currentCartContainer.style.display = "block";
  });
}

if (skipPendingBtn) {
  skipPendingBtn.addEventListener("click", () => {
    pendingOrder = null;
    showPendingOrder();
  });
}

// Work Modal Logic
const workModal = document.getElementById("work-modal");
const closeWorkModalBtn = document.getElementById("close-work-modal");
const workModalImg = document.getElementById("work-modal-img");
const workModalTitle = document.getElementById("work-modal-title");
const workModalPrice = document.getElementById("work-modal-price");
const workModalDesc = document.getElementById("work-modal-desc");

if (confirmCheckoutBtn) {
  confirmCheckoutBtn.addEventListener("click", async () => {
    if (!checkoutName.value.trim() || !checkoutAddress.value.trim() || !checkoutPhone.value.trim()) {
      showToast("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    try {
      const orderItems = cart.map(item => item.name).join(', ');
      await addDoc(collection(db, "bookings"), {
        customer: checkoutName.value.trim(),
        phone: checkoutPhone.value.trim(),
        service: 'طلب منتجات: ' + orderItems,
        date: new Date().toLocaleString('ar-EG'),
        status: 'قيد الانتظار',
        color: '#ff9800'
      });

      showToast("تم إرسال الطلب بنجاح");
      pendingOrder = [...cart];
      cart = [];
      updateCartUI();
      
      // Clear form
      checkoutName.value = "";
      checkoutAddress.value = "";
      checkoutPhone.value = "";
      
      showPendingOrder();
    } catch (error) {
      console.error(error);
      showToast("حدث خطأ أثناء إرسال الطلب");
    }
  });
}

if (closeWorkModalBtn) {
  closeWorkModalBtn.addEventListener('click', () => {
    workModal.style.display = 'none';
  });
}

if (workModal) {
  window.addEventListener('click', (e) => {
    if (e.target === workModal) {
      workModal.style.display = 'none';
    }
  });
}

// Banner Slider Logic
setInterval(() => {
  const slides = document.querySelectorAll(".slide");
  if (slides.length === 0) return;

  let activeIdx = -1;
  slides.forEach((s, i) => {
    if (s.classList.contains("active")) activeIdx = i;
  });
  if (activeIdx === -1) activeIdx = 0;

  const nextIdx = (activeIdx + 1) % slides.length;

  // Move current to the right (prev)
  slides[activeIdx].className = "slide prev";

  // Move next from left (-100%) to center (0)
  slides[nextIdx].className = "slide active";

  // Reset all other slides to the left side (-100%) without transition
  slides.forEach((s, i) => {
    if (i !== activeIdx && i !== nextIdx) {
      s.style.transition = "none";
      s.className = "slide next";
      void s.offsetWidth; // Force reflow
      s.style.transition = "";
    }
  });
}, 4000);

// Booking Wizard Logic
let currentStep = 1;
const bookingData = {
  services: [],
  specialist: "",
  specialistId: "",
  date: "",
  time: "",
  name: "",
  phone: "",
  notes: ""
};

const steps = document.querySelectorAll(".step");
const stepLines = document.querySelectorAll(".step-line");
const wizardSteps = document.querySelectorAll(".wizard-step");

function updateWizardUI() {
  // Update Stepper
  steps.forEach((step, idx) => {
    const stepNum = idx + 1;
    if (stepNum < currentStep) {
      step.classList.add("completed");
      step.classList.remove("active");
    } else if (stepNum === currentStep) {
      step.classList.add("active");
      step.classList.remove("completed");
    } else {
      step.classList.remove("active", "completed");
    }
  });

  stepLines.forEach((line, idx) => {
    if (idx + 1 < currentStep) {
      line.classList.add("active");
    } else {
      line.classList.remove("active");
    }
  });

  // Show Active Step
  wizardSteps.forEach(ws => ws.classList.remove("active"));
  
  if (currentStep <= 5) {
    document.getElementById(`step-${currentStep}`).classList.add("active");
  } else {
    document.getElementById("step-success").classList.add("active");
  }
}

// Next / Prev buttons
document.querySelectorAll(".next-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (currentStep < 5) {
      currentStep++;
      updateWizardUI();
    }
  });
});

document.querySelectorAll(".prev-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (currentStep > 1) {
      currentStep--;
      updateWizardUI();
    }
  });
});

// Step 1: Services (Listeners attached dynamically)
const step1Next = document.querySelector("#step-1 .next-btn");

// Step 2: Specialists (Listeners attached dynamically)
const step2Next = document.querySelector("#step-2 .next-btn");

// Step 3: Date & Time (Listeners attached dynamically)
const step3Next = document.querySelector("#step-3 .next-btn");

function checkStep3Valid() {
  if (bookingData.date && bookingData.time) {
    step3Next.disabled = false;
  }
}

// Step 4: Details
const nameInput = document.getElementById("booking-name");
const phoneInput = document.getElementById("booking-phone");
const notesInput = document.getElementById("booking-notes");
const step4Next = document.querySelector("#step-4 .next-btn");

function checkStep4Valid() {
  if (nameInput.value.trim() !== "" && phoneInput.value.trim() !== "") {
    step4Next.disabled = false;
  } else {
    step4Next.disabled = true;
  }
}

nameInput.addEventListener("input", () => {
  bookingData.name = nameInput.value.trim();
  document.getElementById("summary-name").textContent = bookingData.name || "---";
  checkStep4Valid();
});

phoneInput.addEventListener("input", () => {
  bookingData.phone = phoneInput.value.trim();
  checkStep4Valid();
});

notesInput.addEventListener("input", () => {
  bookingData.notes = notesInput.value.trim();
});

// Step 5: Submit
document.getElementById("submit-booking-btn").addEventListener("click", async () => {
  const submitBtn = document.getElementById("submit-booking-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = 'جاري المعالجة...';

  try {
    const serviceNames = bookingData.services.join(" + ");
    
    // Save to Firebase
    await addDoc(collection(db, "bookings"), {
      customer: bookingData.name,
      phone: bookingData.phone,
      service: serviceNames + ' (مع ' + bookingData.specialist + ')',
      date: bookingData.date + ' الساعة ' + bookingData.time,
      specialist: bookingData.specialist,
      specialistId: bookingData.specialistId,
      dateValue: bookingData.date,
      timeValue: bookingData.time,
      status: 'قيد الانتظار',
      color: '#2196f3',
      notes: bookingData.notes || ''
    });

    currentStep = 6; // Success step
    updateWizardUI();
    
    const message = `مرحباً، أود تأكيد حجزي:
الخدمة: ${serviceNames}
المتخصصة: ${bookingData.specialist}
التاريخ: ${bookingData.date}
الوقت: ${bookingData.time}
الاسم: ${bookingData.name}
الرقم: ${bookingData.phone}
${bookingData.notes ? `ملاحظات: ${bookingData.notes}` : ''}
`;
    
    const whatsappUrl = `https://wa.me/${currentWhatsapp}?text=${encodeURIComponent(message)}`;
    const whatsappLink = document.getElementById("whatsapp-confirm-link");
    if (whatsappLink) {
      whatsappLink.href = whatsappUrl;
    }
  } catch (error) {
    console.error(error);
    showToast("حدث خطأ أثناء إرسال الحجز");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'تأكيد الحجز';
  }
});

document.getElementById("new-booking-btn").addEventListener("click", () => {
  // Reset Wizard
  currentStep = 1;
  bookingData.services = [];
  bookingData.specialist = "";
  bookingData.specialistId = "";
  bookingData.date = "";
  bookingData.time = "";
  bookingData.name = "";
  bookingData.phone = "";
  bookingData.notes = "";
  
  document.querySelectorAll("#services-options .option-card").forEach(o => o.classList.remove("selected"));
  document.querySelectorAll("#specialists-options .option-card").forEach(o => o.classList.remove("selected"));
  document.querySelectorAll("#date-options .time-slot").forEach(o => o.classList.remove("selected"));
  document.querySelectorAll("#time-options .time-slot").forEach(o => o.classList.remove("selected"));
  
  nameInput.value = "";
  phoneInput.value = "";
  notesInput.value = "";
  
  step1Next.disabled = true;
  step2Next.disabled = true;
  step3Next.disabled = true;
  step4Next.disabled = true;
  
  document.getElementById("summary-service").textContent = "---";
  document.getElementById("summary-specialist").textContent = "---";
  document.getElementById("summary-date").textContent = "---";
  document.getElementById("summary-time").textContent = "---";
  document.getElementById("summary-name").textContent = "---";
  document.getElementById("summary-price").textContent = "---";
  
  updateWizardUI();
});

// Product Search Logic
const searchBtn = document.getElementById("search-btn");
const searchContainer = document.getElementById("search-container");
const searchInput = document.getElementById("product-search");
const productCards = document.querySelectorAll(".products .product-card");

searchBtn.addEventListener("click", () => {
  // Navigate to home section if not already there
  const homeTab = document.querySelector('.nav-item[data-target="home-section"]');
  if (homeTab && !homeTab.classList.contains('active')) {
    homeTab.click();
  }

  // Toggle search container
  if (searchContainer.style.display === "none") {
    searchContainer.style.display = "block";
    searchInput.focus();
  } else {
    searchContainer.style.display = "none";
    searchInput.value = "";
    // Reset search
    searchInput.dispatchEvent(new Event("input"));
  }
});

searchInput.addEventListener("input", (e) => {
  const searchTerm = e.target.value.trim().toLowerCase();
  
  productCards.forEach(card => {
    const title = card.querySelector("h4").textContent.toLowerCase();
    // Filter product from the first letter
    if (title.startsWith(searchTerm)) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
});

// End of script
