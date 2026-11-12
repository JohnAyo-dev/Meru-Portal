(function () {
  const M = (window.Meru = window.Meru || {});
  const $ = M.$;

  function initials(meta) {
    const parts = String(meta && meta.name || 'Meru').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'M';
    const text = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
    return text.toUpperCase();
  }

  function activeMeta() {
    return M.profileStore ? M.profileStore.activeMeta() : null;
  }

  function applyHeader(meta) {
    if (!meta) return;
    const initialsText = initials(meta);
    const avatar = $('#profileAvatar');
    if (avatar) avatar.style.background = meta.color || '#ff5a4d';
    const initialsEl = $('#profileInitials');
    if (initialsEl) initialsEl.textContent = initialsText;
    const img = $('#profileImg');
    if (img) {
      if (meta.avatar) {
        img.src = meta.avatar;
        img.style.display = '';
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
      }
    }
    const btnInitials = $('#profileBtnInitials');
    if (btnInitials) btnInitials.textContent = initialsText;
    const btnImg = $('#profileBtnImg');
    if (btnImg) {
      if (meta.avatar) {
        btnImg.src = meta.avatar;
        btnImg.style.display = '';
      } else {
        btnImg.removeAttribute('src');
        btnImg.style.display = 'none';
      }
    }
    const name = $('#profileName');
    if (name) name.textContent = meta.name;
    const tagline = $('#profileTagline');
    if (tagline) tagline.textContent = meta.tagline || '';
    const portalTagline = $('#tagline');
    if (portalTagline) portalTagline.textContent = meta.tagline || '';
  }

  function updateStats() {
    const box = $('#profileStats');
    if (!box) return;
    const ps = M.profileStore;
    const data = ps && ps.data[ps.activeId];
    if (!data) {
      box.innerHTML = '';
      return;
    }
    const open = data.todos.filter(t => !t.done).length;
    const stats = [
      ['Shortcuts', data.shortcuts.length],
      ['Bookmarks', data.bookmarks.length],
      ['History', data.history.length],
      ['Open tasks', open]
    ];
    box.innerHTML = '';
    stats.forEach(([label, value]) => {
      const item = M.el('div', { class: 'pstat' },
        M.el('b', { text: String(value) }),
        M.el('span', { text: label })
      );
      box.append(item);
    });
  }

  function populateForm() {
    const meta = activeMeta();
    if (!meta) return;
    if ($('#profileNameInput')) $('#profileNameInput').value = meta.name;
    if ($('#profileTaglineInput')) $('#profileTaglineInput').value = meta.tagline || '';
    if ($('#profileColor')) $('#profileColor').value = /^#[0-9a-f]{6}$/i.test(meta.color || '') ? meta.color : '#ff5a4d';
    applyHeader(meta);
    updateStats();
  }

  function renderList() {
    const list = $('#profileList');
    if (!list || !M.profileStore) return;
    const ps = M.profileStore;
    list.innerHTML = '';
    ps.items.forEach(item => {
      const li = M.el('li', { class: 'prof' + (item.id === ps.activeId ? ' active' : '') });
      const btn = M.el('button', { type: 'button', class: 'profbtn' });
      const av = M.el('span', { class: 'profav' });
      av.style.background = item.color || '#ff5a4d';
      if (item.avatar) {
        av.append(M.el('img', { alt: '', src: item.avatar }));
      } else {
        av.append(M.el('b', { text: initials(item) }));
      }
      const info = M.el('span', { class: 'profinfo' },
        M.el('strong', { text: item.name }),
        M.el('small', { text: item.id === ps.activeId ? 'Active profile' : 'Click to switch' })
      );
      btn.append(av, info);
      btn.addEventListener('click', () => {
        if (item.id === ps.activeId) return;
        ps.switchTo(item.id);
        location.reload();
      });
      const del = M.el('button', { type: 'button', class: 'proftrash', text: '\u00d7', 'aria-label': 'Delete ' + item.name });
      del.addEventListener('click', e => {
        e.stopPropagation();
        if (ps.items.length <= 1) {
          M.toast('Keep at least one profile');
          return;
        }
        if (!confirm('Delete the profile "' + item.name + '" and all of its shortcuts, history and notes?')) return;
        const wasActive = item.id === ps.activeId;
        ps.remove(item.id);
        if (wasActive) {
          location.reload();
          return;
        }
        renderList();
        updateStats();
      });
      li.append(btn, del);
      list.append(li);
    });
  }

  function saveProfile() {
    const ps = M.profileStore;
    const meta = activeMeta();
    if (!ps || !meta) return;
    const name = $('#profileNameInput').value.trim();
    if (!name) {
      M.toast('Give the profile a name');
      return;
    }
    ps.update(meta.id, {
      name,
      tagline: $('#profileTaglineInput').value.trim(),
      color: $('#profileColor').value
    });
    renderList();
    populateForm();
    M.toast('Profile saved');
  }

  M.renderProfiles = function () {
    renderList();
    populateForm();
  };

  M.initProfiles = function () {
    if (!$('#profileList') || !M.profileStore) return;
    renderList();
    populateForm();

    $('#profileSave').addEventListener('click', saveProfile);
    $('#profileNameInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveProfile(); }
    });
    $('#profileColor').addEventListener('input', e => {
      const meta = activeMeta();
      if (!meta) return;
      meta.color = e.target.value;
      applyHeader(meta);
      M.profileStore.persist();
    });
    $('#profilePersonalise').addEventListener('click', () => M.openSettings());

    $('#profileAdd').addEventListener('click', () => {
      const meta = M.profileStore.add('Profile ' + (M.profileStore.items.length + 1));
      M.profileStore.switchTo(meta.id);
      location.reload();
    });

    const upload = $('#profileAvatarUpload');
    if (upload) upload.addEventListener('click', async () => {
      if (!window.meru || !window.meru.pickAvatar) {
        M.toast('Profile pictures work in the desktop app');
        return;
      }
      const url = await window.meru.pickAvatar();
      if (!url) return;
      const meta = activeMeta();
      if (!meta) return;
      M.profileStore.update(meta.id, { avatar: url });
      renderList();
      populateForm();
      M.toast('Profile picture updated');
    });

    const clear = $('#profileAvatarClear');
    if (clear) clear.addEventListener('click', () => {
      const meta = activeMeta();
      if (!meta) return;
      M.profileStore.update(meta.id, { avatar: '' });
      renderList();
      populateForm();
      M.toast('Profile picture cleared');
    });

    applyHeader(activeMeta());
  };
})();
