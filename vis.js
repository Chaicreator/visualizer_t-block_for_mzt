// script.js

document.addEventListener("DOMContentLoaded", () => {
  // ================================
  // 1. СЛОВАРЬ АТРИБУТОВ
  // ================================
  // Представим, что это "овощи" :)
  // LC = Огурец
  // LP = Помидор
  // a  = Картошка
  // b  = Морковка
  const attributes = {
    LC: "Огурец",
    LP: "Помидор",
    a: "Картошка",
    b: "Морковка",
  };

  // ================================
  // 2. МАССИВ КАРТИНОК С АТРИБУТАМИ
  // ================================
  const images = [
    {
      url: "https://mzt-zavod.ru/wp-content/uploads/2025/02/Trevi-%D0%A3%D0%BC%D0%B1%D1%80%D0%B0-1-2048x2048.jpg",
      attrs: ["LP", "a"], // Помидор + Картошка
    },
    {
      url: "https://mzt-zavod.ru/wp-content/uploads/2025/06/Brickwall-%D0%A1%D0%B5%D1%80%D1%8B%D0%B9-2048x2048.jpg",
      attrs: ["LP", "b"], // Помидор + Морковка
    },
    {
      url: "https://mzt-zavod.ru/wp-content/uploads/2025/07/Cerrad-Loft-Brick-Cardamon.jpg",
      attrs: ["LC", "a"], // Огурец + Картошка
    },
    {
      url: "https://mzt-zavod.ru/wp-content/uploads/2025/07/Cerrad-Loft-Brick-Chili.jpg",
      attrs: ["LC", "b"], // Огурец + Морковка
    },
  ];

  // ================================
  // 3. МАССИВ КНОПОК
  // ================================
  // Каждая кнопка имеет группу, значение (value) и картинку
  const buttons = [
    {
      group: "group1",
      value: "LC",
      image: "https://mzt-zavod.ru/wp-content/uploads/2025/02/11.2-%D0%9A%D0%BB%D0%B8%D0%BD%D0%BA%D0%B5%D1%80%D0%BD%D0%B0%D1%8F-%D1%82%D0%B5%D1%80%D0%BC%D0%BE%D0%BF%D0%B0%D0%BD%D0%B5%D0%BB%D1%8C-Sandia-%D0%9F%D0%B5%D1%81%D0%BE%D1%87%D0%BD%D1%8B%D0%B9-150x150.jpg",
    },
    {
      group: "group1",
      value: "LP",
      image: "https://mzt-zavod.ru/wp-content/uploads/2025/02/11.2-%D0%9A%D0%BB%D0%B8%D0%BD%D0%BA%D0%B5%D1%80%D0%BD%D0%B0%D1%8F-%D1%82%D0%B5%D1%80%D0%BC%D0%BE%D0%BF%D0%B0%D0%BD%D0%B5%D0%BB%D1%8C-Sandia-%D0%9F%D0%B5%D1%81%D0%BE%D1%87%D0%BD%D1%8B%D0%B9-150x150.jpg",
    },
    {
      group: "group2",
      value: "a",
      image: "https://mzt-zavod.ru/wp-content/uploads/2025/02/11.2-%D0%9A%D0%BB%D0%B8%D0%BD%D0%BA%D0%B5%D1%80%D0%BD%D0%B0%D1%8F-%D1%82%D0%B5%D1%80%D0%BC%D0%BE%D0%BF%D0%B0%D0%BD%D0%B5%D0%BB%D1%8C-Sandia-%D0%9F%D0%B5%D1%81%D0%BE%D1%87%D0%BD%D1%8B%D0%B9-150x150.jpg",
    },
    {
      group: "group2",
      value: "b",
      image: "https://mzt-zavod.ru/wp-content/uploads/2025/02/11.2-%D0%9A%D0%BB%D0%B8%D0%BD%D0%BA%D0%B5%D1%80%D0%BD%D0%B0%D1%8F-%D1%82%D0%B5%D1%80%D0%BC%D0%BE%D0%BF%D0%B0%D0%BD%D0%B5%D0%BB%D1%8C-Sandia-%D0%9F%D0%B5%D1%81%D0%BE%D1%87%D0%BD%D1%8B%D0%B9-150x150.jpg",
    },
  ];

  // ================================
  // 4. СОЗДАЕМ КОНТЕЙНЕР
  // ================================
  const container = document.createElement("div");
  container.style.position = "relative";
  container.style.width = "100%";
  container.style.height = "80vh"; // адаптивная высота
  container.style.backgroundImage = `url(${images[0].url})`;
  container.style.backgroundPosition = "center";
  container.style.backgroundRepeat = "no-repeat";
  container.style.backgroundSize = "contain";
  container.style.backgroundColor = "#000";
  document.getElementById("my-gallery").appendChild(container);

  // Панель кнопок справа
  const panel = document.createElement("div");
  panel.style.position = "absolute";
  panel.style.top = "0";
  panel.style.right = "0";
  panel.style.width = "30%";
  panel.style.height = "100%";
  panel.style.backgroundColor = "rgba(0,0,0,0.3)";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.justifyContent = "center";
  panel.style.alignItems = "center";
  panel.style.gap = "10px";
  container.appendChild(panel);

  // ================================
  // 5. СОСТОЯНИЕ ВЫБОРА
  // ================================
  const state = {};

  // ================================
  // 6. СОЗДАЕМ КНОПКИ
  // ================================
  function createButton(btnConfig, row) {
    const btn = document.createElement("button");
    btn.style.width = "80px";
    btn.style.height = "80px";
    btn.style.border = "2px solid white";
    btn.style.borderRadius = "8px";
    btn.style.backgroundImage = `url(${btnConfig.image})`;
    btn.style.backgroundSize = "cover";
    btn.style.backgroundPosition = "center";
    btn.style.cursor = "pointer";

    btn.addEventListener("click", () => {
      // снимаем выделение с кнопок в ряду
      row.querySelectorAll("button").forEach((b) => (b.style.outline = "none"));
      btn.style.outline = "3px solid lime";
      state[btnConfig.group] = btnConfig.value;
    });

    return btn;
  }

  const groups = [...new Set(buttons.map((b) => b.group))];
  groups.forEach((group) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "10px";
    buttons
      .filter((b) => b.group === group)
      .forEach((btnConf) => row.appendChild(createButton(btnConf, row)));
    panel.appendChild(row);
  });

  // ================================
  // 7. КНОПКА "ПОСМОТРЕТЬ"
  // ================================
  const checkBtn = document.createElement("button");
  checkBtn.textContent = "посмотреть";
  checkBtn.style.padding = "12px 25px";
  checkBtn.style.fontSize = "18px";
  checkBtn.style.border = "none";
  checkBtn.style.borderRadius = "8px";
  checkBtn.style.backgroundColor = "limegreen";
  checkBtn.style.color = "#fff";
  checkBtn.style.cursor = "pointer";
  checkBtn.style.marginTop = "20px";

  checkBtn.addEventListener("click", () => {
    const selected = Object.values(state);
    if (selected.length < groups.length) {
      alert("Выберите по одной кнопке из каждой группы");
      return;
    }
    const found = images.find((img) =>
      selected.every((v) => img.attrs.includes(v))
    );
    if (found) {
      container.style.backgroundImage = `url(${found.url})`;
    } else {
      alert("Нет изображения с такими параметрами");
    }
  });
  panel.appendChild(checkBtn);

  // ================================
  // 8. АДАПТИВНОСТЬ ДЛЯ МОБИЛЬНЫХ
  // ================================
  const style = document.createElement("style");
  style.textContent = `
    @media(max-width:768px){
      #my-gallery > div {
        flex-direction: column !important;
        width: 100% !important;
        height: auto !important;
      }
      #my-gallery > div > div {
        flex-wrap: wrap;
        justify-content: center;
        gap: 10px;
      }
    }
  `;
  document.head.appendChild(style);
});
