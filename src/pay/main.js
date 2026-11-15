// The page friends open from a payment link (pay.html). The split is in the link's hash; it is unpacked
// with src/lib/splitLink.js and every share is worked out with src/lib/totals.js, the same code the app uses.
import { unpackSplit } from "../lib/splitLink.js";
import { computeTotals, shareLines } from "../lib/totals.js";
import { requestStore } from "../lib/requests.js";

(function () {
  var UPI = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;
  var card = document.getElementById("card");
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function fail() {
    card.textContent = "";
    card.appendChild(el("p", "error", "This payment link is invalid or incomplete."));
  }

  function money(c, n) { return c + n.toFixed(2); }

  // Saved requests (listed in the app under History > Requests), see src/lib/requests.js
  var HASH = location.hash.slice(1);
  var store = requestStore(HASH);
  var myReq = store.get, remember = store.remember, patchReq = store.patch;

  // UPI only when a valid ID was sent and the bill is in rupees
  function hasUpi(v) { return v.c === "₹" && UPI.test(v.upi); }
  function upiHref(v, amount) {
    var params = new URLSearchParams({ pa: v.upi, pn: v.payee, am: amount.toFixed(2), cu: "INR" });
    if (v.note) params.set("tn", v.note.slice(0, 50));
    return "upi://pay?" + params.toString();
  }
  // Same payment, opened straight in Google Pay instead of the UPI app picker.
  // Android: intent pinned to GPay's package. iOS: GPay's own scheme. Elsewhere: none.
  function gpayHref(upi) {
    var ua = navigator.userAgent, query = upi.slice(upi.indexOf("?"));
    if (/Android/i.test(ua)) return "intent://pay" + query + "#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end";
    if (/iPhone|iPad|iPod/i.test(ua)) return "gpay://upi/pay" + query;
    return "";
  }
  $("copy").addEventListener("click", function () {
    var b = $("copy"), icon = b.innerHTML;
    navigator.clipboard.writeText($("upi").textContent).then(function () {
      b.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
      setTimeout(function () { b.innerHTML = icon; }, 1500);
    });
  });

  var COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
  var round2 = function (n) { return Math.round(n * 100) / 100; };

  // Every link is the whole split. A personal link says whose share it is; on a group link the reader
  // says who they are (remembered for this link). Then the page is the same either way: their share,
  // pay and Mark as paid, and everyone's shares as cards below.
  function show(v) {
    var req = myReq();
    var me = v.me >= 0 ? v.me : req.me != null ? req.me : -1;
    var billTotal = v.everyone.reduce(function (t, p) { return t + p.total; }, 0);
    ["sharehead", "viewas", "mine", "pick", "gpay", "pay", "qrbtn", "upibox", "hint", "mark", "paidnote", "full"].forEach(function (id) { $(id).hidden = true; });
    // Reads like a receipt: the bill's name over the amount, then what the amount is
    $("label").textContent = v.note || "Bill split";
    $("note").textContent = "";

    if (v.legacy) {
      var only = v.everyone[0];
      $("amount").textContent = money(v.c, only.total);
      $("to").textContent = v.payee ? "to " + v.payee : "";
      myLines(v, only);
      payArea(v, only);
      $("people").hidden = true;
      return;
    }

    if (me < 0) {
      // Group link, reader not known yet: the split itself is the first screen. Everyone's share,
      // and tapping your name takes you to your share and the pay options (remembered for this link)
      $("amount").textContent = money(v.c, billTotal);
      $("to").textContent = "Total \u00b7 paid by " + v.everyone[0].name;
      var pick = $("pick");
      pick.textContent = "";
      pick.appendChild(el("div", "pick-label", "Tap your name to pay"));
      v.everyone.forEach(function (p, i) {
        var b = el("button", "pick-row");
        b.type = "button";
        b.appendChild(avatar(p, i));
        var who = el("span", "pick-name", p.name);
        if (i === 0) who.appendChild(el("span", "tag", "payer"));
        else if (p.paid) who.appendChild(el("span", "tag ok", "\u2713 paid"));
        b.appendChild(who);
        b.appendChild(el("span", "amt", money(v.c, p.total)));
        b.addEventListener("click", function () {
          patchReq({ me: i, who: p.name, share: round2(p.total), payer: i === 0 });
          show(v);
        });
        pick.appendChild(b);
      });
      pick.hidden = false;
      people(v, -1, true); // the itemized bill, behind View full bill
      return;
    }

    if (me === 0) {
      // The payer opened it: what's left to collect
      var owed = v.everyone.reduce(function (t, p, i) { return i > 0 && !p.paid ? t + p.total : t; }, 0);
      $("amount").textContent = money(v.c, billTotal);
      $("note").textContent = "Total \u00b7 paid by you";
      $("to").textContent = owed > 0.004 ? "(collect " + money(v.c, owed) + ")" : "(everyone has paid)";
      if (v.me < 0) changeLink(v, v.everyone[0].name);
    } else {
      var mine = v.everyone[me];
      $("amount").textContent = money(v.c, round2(mine.total));
      // Say what the amount is: the same bill showed its total on the list, so name the share and the whole
      // How much, and whose share it is; the bill's total and payer describe the bill above
      $("note").textContent = money(v.c, billTotal) + " total \u00b7 paid by " + v.everyone[0].name;
      $("sharehead").textContent = mine.name + "\u2019s share";
      $("sharehead").hidden = false;
      $("to").textContent = "";
      myLines(v, mine);
      payArea(v, mine);
      if (v.me < 0) changeLink(v, mine.name);
    }
    // On your share, everyone else's shares wait behind View full bill; otherwise they're the main content
    people(v, me, me > 0);
  }

  // QR of the UPI payment (qrcode-generator, loaded on first use; dark on white so scanners read it in dark mode)
  var qrcode = null;
  function showQr(v, amount, link) {
    $("qramount").textContent = money(v.c, amount);
    $("qrto").textContent = "to " + v.payee + " \u00b7 " + v.upi;
    var draw = function () {
      var qr = qrcode(0, "M");
      qr.addData(link);
      qr.make();
      var n = qr.getModuleCount(), d = "";
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += "M" + (c + 4) + " " + (r + 4) + "h1v1h-1z";
      $("qr").innerHTML = '<svg viewBox="0 0 ' + (n + 8) + " " + (n + 8) + '" shape-rendering="crispEdges" role="img" aria-label="UPI payment QR code"><path fill="#000" d="' + d + '"/></svg>';
      openSheet("qrsheet");
    };
    import("qrcode-generator").then(function (m) { qrcode = m.default; draw(); });
  }
  // Sheets close with ×, a tap outside, Escape, or Back: each open sheet adds a history entry, so Back closes
  // just the sheet, and the other ways go back through that entry
  var hideSheets = function () { ["qrsheet", "billsheet"].forEach(function (id) { $(id).hidden = true; }); };
  var openSheet = function (id) {
    $(id).hidden = false;
    if (!(history.state && history.state.sheet)) history.pushState({ sheet: id }, "");
  };
  var closeSheets = function () {
    if (history.state && history.state.sheet) history.back(); else hideSheets();
  };
  window.addEventListener("popstate", hideSheets);
  if (history.state && history.state.sheet) history.replaceState(null, ""); // reloaded with a sheet open
  ["qrsheet", "billsheet"].forEach(function (id) {
    $(id).addEventListener("click", function (e) { if (e.target === $(id) || e.target.hasAttribute("data-close")) closeSheets(); });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheets(); });

  // What the reader's share is made of, always visible (everyone else's is behind View full bill)
  function myLines(v, p) {
    var box = $("mine");
    box.textContent = "";
    p.lines.forEach(function (l) {
      var r = el("div", "pline");
      r.appendChild(el("span", null, l[0]));
      r.appendChild(el("span", null, money(v.c, l[1])));
      box.appendChild(r);
    });
    box.hidden = !p.lines.length;
  }

  // On a group link: a quiet "Not Gopu?" at the bottom of the card, back to the list of names
  function changeLink(v, who) {
    var line = $("viewas");
    line.textContent = "";
    var b = el("button", "linkish", "Not " + who + "?");
    b.type = "button";
    line.appendChild(b);
    line.hidden = false;
    b.onclick = function () { patchReq({ me: undefined, who: undefined, share: undefined, payer: undefined, paid: false }); show(v); };
  }

  // Pay options and Mark as paid for the reader's share; once paid, the pay options step aside
  function payArea(v, mine) {
    var byPayer = mine.paid, marked = !!myReq().paid, paid = byPayer || marked;
    if (hasUpi(v) && !paid) {
      $("pay").href = upiHref(v, round2(mine.total));
      $("pay").hidden = false;
      $("qrbtn").hidden = false;
      $("qrbtn").onclick = function () { showQr(v, round2(mine.total), $("pay").href); };
      var gpay = gpayHref($("pay").href);
      if (gpay) { $("gpay").href = gpay; $("gpay").hidden = false; }
      $("upi").textContent = v.upi;
      $("upibox").hidden = false;
    } else if (!paid) {
      $("hint").textContent = v.payee ? "Settle up with " + v.payee + " directly." : "Settle up with the person who paid.";
      $("hint").hidden = false;
    }
    $("mark").hidden = paid;
    $("mark").onclick = function () { patchReq({ paid: true }); show(v); };
    var note = $("paidnote");
    note.hidden = !paid;
    note.textContent = byPayer ? "\u2713 Marked paid by " + (v.payee || "the payer") : paid ? "\u2713 You marked your share paid" : "";
    if (marked && !byPayer) {
      var undo = el("button", null, "Undo");
      undo.type = "button";
      undo.addEventListener("click", function () { patchReq({ paid: false }); show(v); });
      note.appendChild(undo);
    }
  }

  function avatar(p, i) {
    var a = el("span", "avatar", (p.name.trim()[0] || "?").toUpperCase());
    a.style.background = COLORS[i % COLORS.length];
    return a;
  }

  // Everyone's shares as cards; the reader's own card first and outlined. Tap a card for its items.
  // The full bill as one receipt, person by person: name and total, then what their share is made of
  function people(v, me, collapsed) {
    var billTotal = v.everyone.reduce(function (t, p) { return t + p.total; }, 0);
    $("peoplehead").textContent = "";
    var box = collapsed ? $("billbody") : $("cards");
    box.textContent = "";
    $("cards").textContent = "";
    var receipt = el("div", "receipt"), rtop = el("div", "r-top"), rscroll = el("div", "r-scroll");
    // A printed bill: name, who paid, each person's part, the total
    rtop.appendChild(el("div", "r-title", v.note || "Bill split"));
    rtop.appendChild(el("div", "r-sub", v.everyone.length + " people \u00b7 paid by " + v.everyone[0].name));
    // Two views of the same receipt: the bill as printed, and who pays what
    // Switch by tapping or swiping; the highlight slides, and the content follows the finger
    var tabs = el("div", "r-tabs"), bill = el("div", "r-body"), split = el("div", "r-body");
    var pill = el("span", "r-pill"), bodies = [bill, split], btns = [], cur = 0;
    tabs.appendChild(pill);
    var setPill = function (pos, animate) {
      pill.style.transition = animate ? "transform .28s cubic-bezier(.2, .8, .2, 1)" : "none";
      pill.style.transform = "translateX(" + pos * 100 + "%)";
    };
    var go = function (i) {
      if (i === cur || i < 0 || i >= bodies.length) return setPill(cur, true);
      var dir = i > cur ? 1 : -1;
      cur = i;
      btns.forEach(function (b, k) { b.className = k === i ? "on" : ""; });
      bodies.forEach(function (b, k) { b.hidden = k !== i; });
      var b = bodies[i];
      b.style.animation = "none";
      void b.offsetWidth; // restart the slide-in
      b.style.animation = (dir > 0 ? "tab-r" : "tab-l") + " .22s cubic-bezier(.2, .8, .2, 1)";
      setPill(i, true);
    };
    ["Bill", "Split"].forEach(function (label, k) {
      var b = el("button", k === 0 ? "on" : null, label);
      b.type = "button";
      b.addEventListener("click", function () { go(k); });
      btns.push(b);
      tabs.appendChild(b);
    });
    split.hidden = true;
    rtop.appendChild(tabs);
    // Sideways drag on the content: follow it (rubber band at the ends), then switch or spring back
    var g = null;
    rscroll.addEventListener("touchstart", function (e) {
      var t = e.touches[0];
      g = { x: t.clientX, y: t.clientY, t: Date.now(), axis: null, dx: 0 };
    }, { passive: true });
    rscroll.addEventListener("touchmove", function (e) {
      if (!g) return;
      var t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y, body = bodies[cur];
      if (!g.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (g.axis !== "x") return;
      var has = !!bodies[cur + (dx < 0 ? 1 : -1)];
      g.dx = has ? dx : dx * 0.25;
      body.style.animation = "none";
      body.style.transition = "none";
      body.style.transform = "translateX(" + g.dx + "px)";
      setPill(cur + (has ? -g.dx / body.offsetWidth : 0), false);
    }, { passive: true });
    var end = function () {
      var d = g;
      g = null;
      if (!d || d.axis !== "x") return;
      var body = bodies[cur], w = body.offsetWidth, step = d.dx < 0 ? 1 : -1;
      var flick = Math.abs(d.dx) / Math.max(1, Date.now() - d.t) > 0.5;
      body.style.transition = "transform .2s cubic-bezier(.2, .8, .2, 1), opacity .2s";
      if (bodies[cur + step] && (Math.abs(d.dx) > w * 0.3 || (flick && Math.abs(d.dx) > 30))) {
        body.style.transform = "translateX(" + (-step * w) + "px)";
        body.style.opacity = "0";
        setPill(cur + step, true);
        setTimeout(function () { body.style.transition = body.style.transform = body.style.opacity = ""; go(cur + step); }, 170);
      } else {
        body.style.transform = "translateX(0)";
        setPill(cur, true);
        setTimeout(function () { body.style.transition = body.style.transform = ""; }, 220);
      }
    };
    rscroll.addEventListener("touchend", end);
    rscroll.addEventListener("touchcancel", end);

    // Bill: as printed. Items at full price, subtotal, charges
    var line = function (label, amount, cls) {
      var r = el("div", "bline" + (cls ? " " + cls : ""));
      r.appendChild(el("span", null, label));
      r.appendChild(el("span", "bamt", money(v.c, amount)));
      return r;
    };
    var itemsSum = 0;
    (v.items || []).forEach(function (it) {
      itemsSum += Number(it[1]) || 0;
      bill.appendChild(line(String(it[0]), Number(it[1]) || 0));
    });
    var taxes = v.taxes || [];
    if (taxes.length || v.roundOff) {
      bill.appendChild(el("div", "r-rule"));
      bill.appendChild(line("Subtotal", itemsSum, "muted"));
    }
    taxes.forEach(function (t) { bill.appendChild(line(String(t[0]), Number(t[1]) || 0, "muted")); });
    if (v.roundOff) {
      var raw = (v.items || []).reduce(function (t, it) { return t + (Number(it[1]) || 0); }, 0) + taxes.reduce(function (t, x) { return t + (Number(x[1]) || 0); }, 0);
      var adj = Math.round((Math.round(raw) - raw) * 100) / 100;
      if (adj) bill.appendChild(line("Round off", adj, "muted"));
    }

    // Split: each person's total and what it's made of
    var req = myReq();
    v.everyone.forEach(function (p, i) {
      var sec = el("div", "r-person" + (i === me ? " me" : ""));
      var head = el("div", "r-head");
      var name = el("span", "r-name");
      name.appendChild(avatar(p, i));
      name.appendChild(document.createTextNode(p.name));
      var tags = [];
      if (i === me) tags.push(["you", "you"]);
      if (i === 0) tags.push(["payer", ""]);
      else if (p.paid || (i === me && req.paid)) tags.push(["\u2713 paid", "ok"]);
      tags.forEach(function (t) { name.appendChild(el("span", "tag " + t[1], t[0])); });
      head.appendChild(name);
      head.appendChild(el("span", "r-amt", money(v.c, p.total)));
      sec.appendChild(head);
      p.lines.forEach(function (l) {
        var r = el("div", "pline");
        r.appendChild(el("span", null, l[0]));
        r.appendChild(el("span", null, money(v.c, l[1])));
        sec.appendChild(r);
      });
      split.appendChild(sec);
    });
    rscroll.appendChild(bill);
    rscroll.appendChild(split);
    var tot = el("div", "r-total");
    tot.appendChild(el("span", null, "Total"));
    tot.appendChild(el("span", null, money(v.c, billTotal)));
    rscroll.appendChild(tot);
    // In the sheet, the heading and tabs stay put while the items scroll
    receipt.appendChild(rtop);
    receipt.appendChild(rscroll);
    box.appendChild(receipt);
    var full = $("full");
    full.hidden = !collapsed;
    $("people").hidden = !!collapsed;
    full.textContent = "View full bill";
    full.onclick = function () { openSheet("billsheet"); var sc = $("billsheet").querySelector(".r-scroll"); if (sc) sc.scrollTop = 0; };
  }

  // Changing only the hash keeps the same document, so re-run from scratch for the new link
  window.addEventListener("hashchange", function () { location.reload(); });

  // Theme switch, as in the app's header: flips light/dark and saves the choice for the app too
  $("theme").addEventListener("click", function () {
    var root = document.documentElement, cur = root.getAttribute("data-theme");
    var dark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    var next = dark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      var saved = JSON.parse(localStorage.getItem("spliteasy:v1")) || {};
      saved.theme = next;
      localStorage.setItem("spliteasy:v1", JSON.stringify(saved));
    } catch (e) { /* storage unavailable */ }
  });

  // Every opened request is kept on this device, so it can be found again in the app (History > Requests)
  var hash = HASH;
  if (hash) {
    try {
      var link = unpackSplit(hash);
      // Everyone's share and what it's made of, worked out exactly as the app does (src/lib/totals.js)
      var everyone = computeTotals(link.bill, link.people, link.assignments).map(function (p) {
        return {
          name: p.name, total: p.total, paid: !!link.paid[p.id],
          lines: shareLines(link.bill, link.assignments, p).map(function (l) { return [l.note ? l.label + " " + l.note : l.label, l.amount]; })
        };
      });
      var s = {
        note: link.place ? link.place + " bill" : "", c: link.currency, payee: link.payee, upi: link.upiId, me: link.me,
        items: link.bill.items.map(function (i) { return [i.name, i.amount]; }),
        taxes: link.bill.taxes.map(function (t) { return [t.name, t.amount]; }),
        roundOff: link.bill.roundOff
      };
      if (s.me !== -1 && !everyone[s.me]) throw new Error("No such person in this link");
      var billTotal = everyone.reduce(function (t, p) { return t + p.total; }, 0);
      var personal = s.me !== -1 ? everyone[s.me] : null;
      remember(personal
        ? { title: s.note || "Bill split", c: s.c, amount: round2(billTotal), payee: s.payee, me: s.me, who: personal.name, share: round2(personal.total), payer: s.me === 0, paidByPayer: personal.paid }
        : { title: s.note || "Bill split", c: s.c, amount: round2(billTotal), payee: everyone[0].name, group: true });
      show({ c: s.c, payee: s.payee, note: s.note, upi: s.upi, me: s.me, everyone: everyone, items: s.items, taxes: s.taxes, roundOff: s.roundOff });
    } catch (e) { console.error(e); fail(); }
    return;
  }

  // Older links carried one person's share in the query string
  var q = new URLSearchParams(location.search);
  var am = q.get("am") || "";
  if (!/^\d+(\.\d{1,2})?$/.test(am)) return fail();
  var legacy = { name: "Your share", total: Number(am), paid: false, lines: q.getAll("i").map(function (raw) {
    var cut = raw.lastIndexOf("|");
    return cut > 0 ? [raw.slice(0, cut), Number(raw.slice(cut + 1))] : [raw, 0];
  }) };
  show({ c: (q.get("c") || "₹").slice(0, 4), payee: q.get("pn") || "", note: q.get("tn") || "", upi: q.get("pa") || "", me: 0, legacy: true, everyone: [legacy] });
})();
