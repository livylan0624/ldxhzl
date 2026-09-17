// ============================================================
// 课表聚合器 Web 版 - 核心逻辑
// 功能：手动添加课程/任务 + 今天/明天时间轴 + 完成置灰
// 数据：localStorage 持久化（刷新不丢失，无需数据库）
// ============================================================
'use strict'

const STORAGE_KEY = 'kebiao_state_v1'
const $ = sel => document.querySelector(sel)
const $$ = sel => document.querySelectorAll(sel)

// ---------- 状态读写 ----------

// 生成唯一 ID（课程/任务主键）
function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (s && Array.isArray(s.courses) && Array.isArray(s.tasks)) return s
  } catch (e) { /* 数据损坏则重置 */ }
  return null
}

let state = loadState() || { courses: [], tasks: [], semesterStart: '' }
let activeDay = 0 // 0 = 今天，1 = 明天

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

// ---------- 日期工具 ----------

// Date → 'YYYY-MM-DD'（本地时区）
function fmtDate(d) {
  const p = n => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

// 今天(0)或明天(1)的日期串
function dayStr(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return fmtDate(d)
}

// 'YYYY-MM-DD' → 星期几（1=周一 … 7=周日）
function weekdayOf(dateStr) {
  const w = new Date(dateStr + 'T00:00').getDay()
  return w === 0 ? 7 : w
}

// 'YYYY-MM-DD' → 学期第几周（学期开始前返回 0）
function weekOf(dateStr) {
  const start = new Date(state.semesterStart + 'T00:00')
  const cur = new Date(dateStr + 'T00:00')
  const diffDays = Math.floor((cur - start) / 86400000)
  return diffDays < 0 ? 0 : Math.floor(diffDays / 7) + 1
}

// 默认学期起点：本周的周一
function defaultSemesterStart() {
  const d = new Date()
  const w = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - w + 1)
  return fmtDate(d)
}

// ---------- 时间轴构建 ----------

// 某天的课程：按星期 + 周次范围 + 单双周过滤
function coursesOn(dateStr) {
  const wd = weekdayOf(dateStr)
  const wk = weekOf(dateStr)
  return state.courses
    .filter(c => c.weekday === wd)
    .filter(c => wk >= c.weeks.start && wk <= c.weeks.end)
    .filter(c => c.weeks.type === 'all' ||
      (c.weeks.type === 'odd' ? wk % 2 === 1 : wk % 2 === 0))
    .map(c => ({
      kind: 'course',
      id: c.id,
      sortKey: SECTION_TIME_MAP[c.startSection],
      time: SECTION_TIME_MAP[c.startSection] + (c.endSection > c.startSection
        ? '-' + SECTION_TIME_MAP[c.endSection] : ''),
      sections: c.endSection > c.startSection
        ? '第' + c.startSection + '-' + c.endSection + '节'
        : '第' + c.startSection + '节',
      title: c.name,
      teacher: c.teacher,
      classroom: c.classroom,
      weekText: '第' + c.weeks.start + '-' + c.weeks.end + '周·' + WEEK_TYPE_TEXT[c.weeks.type]
    }))
}

// 某天的任务：截止日匹配当天；逾期未完成的固定挂到「今天」
function tasksOn(dateStr) {
  const today = dayStr(0)
  return state.tasks
    .filter(t => {
      const d = t.deadline.slice(0, 10) // 截止日期部分
      if (d === dateStr) return true
      // 今天 tab 额外显示：截止日期已过但未完成的任务
      if (dateStr === today && d < today && t.status !== 'done') return true
      return false
    })
    .map(t => ({
      kind: 'task',
      id: t.id,
      sortKey: t.deadline.slice(0, 10) < dayStr(0) && t.status !== 'done'
        ? '00:00'  // 逾期任务排最前
        : t.deadline.slice(11, 16),
      time: t.deadline.slice(11, 16) + ' 截止',
      title: t.title,
      courseName: t.courseName,
      sourceText: SOURCE_TEXT[t.source] || t.source,
      remark: t.remark,
      done: t.status === 'done',
      countdown: countdown(t),
      overdue: t.deadline.slice(0, 10) < dayStr(0) && t.status !== 'done'
    }))
}

// 任务倒计时文案
function countdown(t) {
  if (t.status === 'done') return '已完成'
  const diff = new Date(t.deadline).getTime() - Date.now()
  if (diff < 0) return '已逾期'
  const h = Math.floor(diff / 3600000)
  if (h >= 24) return '剩 ' + Math.floor(h / 24) + ' 天'
  if (h >= 1) return '剩 ' + h + ' 小时'
  return '剩 ' + Math.max(1, Math.floor(diff / 60000)) + ' 分钟'
}

// 合并某天课程与任务，按时间排序
function buildTimeline(dateStr) {
  return coursesOn(dateStr).concat(tasksOn(dateStr))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}

// ---------- 渲染 ----------

// 防 XSS：所有用户输入渲染前转义
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function cardHtml(item) {
  if (item.kind === 'course') {
    // 课程卡片：蓝色，无完成勾选
    return '<div class="card" data-kind="course" data-id="' + esc(item.id) + '">' +
      '<div class="time">' + esc(item.time) + ' · ' + esc(item.sections) + '</div>' +
      '<div class="title">' + esc(item.title) + '</div>' +
      '<div class="meta">' +
        (item.teacher ? '<span class="tag">' + esc(item.teacher) + '</span>' : '') +
        (item.classroom ? '<span class="tag">' + esc(item.classroom) + '</span>' : '') +
        '<span class="tag">' + esc(item.weekText) + '</span>' +
      '</div>' +
      '<div class="card-actions"><button class="del-btn" data-del="1" title="删除">删除</button></div>' +
      '</div>'
  }
  // 任务卡片：橙色，可勾选完成
  return '<div class="card card-task' + (item.done ? ' done' : '') + '" data-kind="task" data-id="' + esc(item.id) + '">' +
    '<div class="time">' + esc(item.time) + '</div>' +
    '<div class="title">' + esc(item.title) + '</div>' +
    '<div class="meta">' +
      (item.courseName ? '<span class="tag">' + esc(item.courseName) + '</span>' : '') +
      '<span class="tag">' + esc(item.sourceText) + '</span>' +
      (item.overdue
        ? '<span class="tag tag-overdue">已逾期</span>'
        : '<span class="tag tag-countdown' + (item.countdown.indexOf('分钟') > -1 ? ' danger' : '') + '">' + esc(item.countdown) + '</span>') +
      (item.remark ? '<span class="tag">' + esc(item.remark) + '</span>' : '') +
    '</div>' +
    '<div class="card-actions">' +
      '<input type="checkbox" data-check="1" title="标记完成"' + (item.done ? ' checked' : '') + '>' +
      '<button class="del-btn" data-del="1" title="删除">删除</button>' +
    '</div>' +
    '</div>'
}

function render() {
  const dateStr = dayStr(activeDay)
  const wk = weekOf(dateStr)
  $('#dateLabel').textContent = dateStr + ' ' + WEEKDAY_TEXT[weekdayOf(dateStr)] +
    (wk > 0 ? ' · 第 ' + wk + ' 周' : ' · 假期/学期外')

  const items = buildTimeline(dateStr)
  $('#timeline').innerHTML = items.length
    ? items.map(cardHtml).join('')
    : '<div class="empty">' + (activeDay === 0 ? '今天' : '明天') + '没有课程和任务</div>'
}

// ---------- 表单选项初始化 ----------

function fillOptions() {
  // 星期
  $('#weekdaySel').innerHTML = Object.keys(WEEKDAY_TEXT)
    .map(k => '<option value="' + k + '">' + WEEKDAY_TEXT[k] + '</option>').join('')
  // 节次（含上课时间提示）
  const secHtml = Object.keys(SECTION_TIME_MAP)
    .map(k => '<option value="' + k + '">第' + k + '节 ' + SECTION_TIME_MAP[k] + '</option>').join('')
  $('#startSectionSel').innerHTML = secHtml
  $('#endSectionSel').innerHTML = secHtml
  $('#endSectionSel').selectedIndex = 1 // 默认结束节次 = 第2节
  // 周次 1~30
  let weekHtml = ''
  for (let i = 1; i <= 30; i++) weekHtml += '<option value="' + i + '">第' + i + '周</option>'
  $('#weekStartSel').innerHTML = weekHtml
  $('#weekEndSel').innerHTML = weekHtml
  $('#weekEndSel').selectedIndex = 15 // 默认上到第16周
}

// 任务表单的「所属课程」下拉（首项 = 不关联）
function refreshTaskCourseSel() {
  const opts = ['<option value="0">(不关联课程)</option>']
    .concat(state.courses.map((c, i) =>
      '<option value="' + (i + 1) + '">' + esc(c.name) + '（' + WEEKDAY_TEXT[c.weekday] + '）</option>'))
  $('#taskCourseSel').innerHTML = opts.join('')
}

// ---------- 添加弹窗 ----------

function openModal() {
  refreshTaskCourseSel()
  $('#modalMask').hidden = false
  // 任务截止日期默认今天
  $('#taskForm [name="deadlineDate"]').value = dayStr(0)
}

function closeModal() {
  $('#modalMask').hidden = true
}

function switchModalTab(form) {
  $$('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.form === form))
  $('#courseForm').hidden = form !== 'course'
  $('#taskForm').hidden = form !== 'task'
}

// 课程表单提交
function submitCourse(e) {
  e.preventDefault()
  const f = e.target
  const start = Number(f.startSection.value)
  const end = Number(f.endSection.value)
  const wStart = Number(f.weekStart.value)
  const wEnd = Number(f.weekEnd.value)

  // 联动校验：结束值不能小于开始值
  if (end < start) return alert('结束节次不能早于开始节次')
  if (wEnd < wStart) return alert('结束周次不能早于开始周次')

  state.courses.push({
    id: uid('c_'),
    name: f.name.value.trim(),
    teacher: f.teacher.value.trim(),
    classroom: f.classroom.value.trim(),
    weekday: Number(f.weekday.value),
    startSection: start,
    endSection: end,
    weeks: { start: wStart, end: wEnd, type: f.weekType.value },
    source: 'manual',
    createdAt: new Date().toISOString()
  })
  saveState()
  f.reset()
  fillOptions() // 恢复默认选中项
  closeModal()
  render()
}

// 任务表单提交
function submitTask(e) {
  e.preventDefault()
  const f = e.target
  const deadline = f.deadlineDate.value + 'T' + f.deadlineTime.value
  const ts = new Date(deadline).getTime()

  if (isNaN(ts)) return alert('截止时间格式错误')
  if (ts < Date.now()) return alert('截止时间不能早于当前时间')

  const idx = Number(f.courseIndex.value)
  const linked = idx > 0 ? state.courses[idx - 1] : null

  state.tasks.push({
    id: uid('t_'),
    title: f.title.value.trim(),
    courseId: linked ? linked.id : '',
    courseName: linked ? linked.name : '',
    deadline: deadline,
    source: f.source.value,
    status: 'pending',
    remark: f.remark.value.trim(),
    createdAt: new Date().toISOString()
  })
  saveState()
  f.reset()
  f.deadlineTime.value = '23:59'
  closeModal()
  render()
}

// ---------- 卡片操作（事件委托） ----------

// 勾选完成 / 取消完成
function toggleTask(id) {
  const t = state.tasks.find(t => t.id === id)
  if (!t) return
  t.status = t.status === 'done' ? 'pending' : 'done'
  saveState()
  render()
}

// 删除课程或任务
function removeItem(kind, id) {
  if (!confirm('确定删除这条' + (kind === 'course' ? '课程' : '任务') + '吗？')) return
  if (kind === 'course') {
    state.courses = state.courses.filter(c => c.id !== id)
  } else {
    state.tasks = state.tasks.filter(t => t.id !== id)
  }
  saveState()
  render()
}

// ---------- 初始化 ----------

function init() {
  if (!state.semesterStart) {
    state.semesterStart = defaultSemesterStart()
    saveState()
  }
  $('#semesterStart').value = state.semesterStart

  fillOptions()

  // 今天/明天切换
  $$('.tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.tab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    activeDay = Number(btn.dataset.day)
    render()
  }))

  // 学期起点修改
  $('#semesterStart').addEventListener('change', e => {
    if (!e.target.value) return
    state.semesterStart = e.target.value
    saveState()
    render()
  })

  // 弹窗
  $('#addBtn').addEventListener('click', openModal)
  $('#cancelBtn').addEventListener('click', closeModal)
  $('#cancelBtn2').addEventListener('click', closeModal)
  $('#modalMask').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
  $$('.modal-tab').forEach(t => t.addEventListener('click', () => switchModalTab(t.dataset.form)))

  // 表单提交
  $('#courseForm').addEventListener('submit', submitCourse)
  $('#taskForm').addEventListener('submit', submitTask)

  // 时间轴卡片操作（事件委托：勾选/删除）
  $('#timeline').addEventListener('click', e => {
    const card = e.target.closest('.card')
    if (!card) return
    const { kind, id } = card.dataset
    if (e.target.dataset.check !== undefined) return toggleTask(id)
    if (e.target.dataset.del) return removeItem(kind, id)
  })

  // 每分钟刷新一次倒计时
  setInterval(render, 60000)

  render()
}

init()
