// 线性拟合，用于部分省会的经纬度到SVG坐标的对准拟合
function linearRegression(data) {
  let xSum = 0;
  let ySum = 0;

  for (let i = 0; i < data.length; i++) {
    xSum += data[i].x;
    ySum += data[i].y;
  }

  const xMean = xSum / data.length;
  const yMean = ySum / data.length;
  let num = 0;
  let den = 0;

  for (let i = 0; i < data.length; i++) {
    const x = data[i].x;
    const y = data[i].y;
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) * (x - xMean);
  }
  const a = num / den; // y=ax+b
  const b = yMean - a * xMean; // y=ax+b

  return { a: a, b: b }
}

// 根据id或名号得到节点数据
function findNode(id) {
  return patriarchs.filter(p => p.id === id || p.name === id)[0]
}

// 根据上级名号得到下一级树节点
function findNodes(parent, group) {
  return patriarchs.filter(p => p.parent.indexOf(parent) >= 0) // p.parent 可能以…开头
    .map(p => {
      const a_attr = { title: '' }

      p.group = group
      if (p.alias.length) {
        console.assert(Array.isArray(p.alias), p.name + ': invalid alias')
        a_attr.title += p.name + '(' + p.alias.join(', ') + ')\n' // 节点提示文本
        p.alias.forEach(alia => {
          if (/[宗派系]$/.test(alia)) { // 提取为派系名
            if (/宗/.test(p.group) && !/宗/.test(alia)) {
              p.group = /^(.+宗)/.exec(p.group)[1] + alia
            } else {
              p.group = alia
            }
            p.head = '☆'
            p.alias.splice(p.alias.indexOf(alia), 1)
          }
        })
      }
      if (p.templesFull.length) {
        a_attr.title += p.templesFull.join('\n')
      }
      return {
        id: p.id,
        text: ((/…/.test(p.parent) ? '…' : p.head ? `<small>${p.head}</small>` : '') + p.name).replace(dummyRe, '…'),
        children: findNodes(p.name, p.group),
        data: p,
        a_attr: a_attr
      }
    })
}

let lngS = 0, latS = 0 // 经纬度到SVG坐标的系数
let draw;
const svgTmp = {}
const svgTooltip = document.getElementById('tooltip')
const dummyRe = /^(.+未知|…)$/

const searchResult = {}
var $searchResult = $('#search-list')
var isTouch = 'ontouchstart' in document.documentElement

// 模糊搜索
const fuse = new Fuse(patriarchs, {
  keys: ['name', 'alias', 'temples', 'templesFull'],
  minMatchCharLength: 2,
  includeScore: true,
  includeMatches: true,
  findAllMatches: true
})

// 根据文本搜索并显示结果列表
function search(text, maxCount=0) {
  let lastScore = 0.8

  $searchResult.html('')
  fuse.search(text).slice(0, maxCount || 20).forEach(s => { // 取前20个结果，分值从低到高，0为完全匹配，1为完全不匹配
    if (lastScore > s.score - 0.3 && !dummyRe.test(s.item.name)) { // 遇到分值跳到较大(更不匹配)的结果就停止
      const $r = $('<div class="search-item"/>').data('id', s.item.id)

      if (!s.matches.filter(m => m.key === 'name')[0]) { // 确保有人名
        $('<span class="s-name"/>').appendTo($r).text(s.item.name)
      }
      s.matches.forEach(m => { // 对匹配部分加粗
        let t = m.value
        m.indices.reverse()
        m.indices.forEach(d => {
          t = t.substring(0, d[0]) + '<b>' + t.substring(d[0], d[1] + 1) + '</b>' + t.substring(d[1] + 1)
        })
        $('<span/>').appendTo($r).addClass('s-' + m.key).html(t)
      })
      $searchResult.append($r)
      lastScore = s.score
    }
  })
}

// 切换和加载指定id的节点
function clickNode(id) {
  const tree = $.jstree.reference('#name-tree')
  if (tree) {
    tree.deselect_all(true)
    tree.select_node(id)
    hideSearchList(true)
  }
  return false // break event
}

function showSearchList() {
  clearTimeout(searchResult.timer)
  searchResult.timer = setTimeout(() => $searchResult.show(), 50)
}

function hideSearchList(force=false) {
  setTimeout(function () {
    if ($searchResult.is(':visible')) {
      clearTimeout(searchResult.timer)
      searchResult.timer = setTimeout(() => $searchResult.hide(), force === true ? 0 : 100)
    }
  }, 50)
  onCircleLeave()
}

function circleEnter(el, top, left) {
  setTimeout(() => {
    clearTimeout(svgTmp.tmTip)
    svgTooltip.innerText = el.getAttribute('data-title') || el.getAttribute('title')
    svgTooltip.style.top = `${top}px`
    svgTooltip.style.left = `${left}px`
    svgTooltip.removeAttribute('hidden')
  }, 20)
}

// 地点圆点的鼠标滑入消息响应
function onCircleEnter(e) {
  circleEnter(this, e.pageY + 10, e.pageX - 50)
  e.preventDefault()
  e.stopImmediatePropagation()
}

// 地点圆点的鼠标滑出消息响应
function onCircleLeave() {
  clearTimeout(svgTmp.tmTip)
  svgTmp.tmTip = setTimeout(() => svgTooltip.toggleAttribute('hidden', true), 200)
}

function getTempleTag(temple) {
  const r = Object.entries(templeTags).filter(v => v[1].indexOf(temple) >= 0)[0]
  return r && r[0]
}

// 显示给定多个人的地点圆点、地点对应的各个人名的列表
function showChildren(people, $content=null) {
  const nodes = {}

  people.forEach(p => {
    p.temples.forEach((temple, i) => {
      if (p.coordinates[i]) {
        nodes[temple] = nodes[temple] || {names: [], coordinate: p.coordinates[i]}
        nodes[temple].names.push(p.name)
      }
    })
  })
  const hi = addCircles({
    temples: Object.keys(nodes).map(s => {
      const n = nodes[s].names.length
      return `${s}${n > 1 ? ' ' + n : ''}: ` + nodes[s].names.join(', ')
    }),
    coordinates: Object.keys(nodes).map(s => nodes[s].coordinate)
  })
  if ($content) {
    const $temples = $('<div class="row temples-map"/>')
    const temples = Object.keys(nodes)

    temples.sort((a, b) => {
      a = templeMap[a].replace(templeRe, '')
      b = templeMap[b].replace(templeRe, '')
      return a < b ? -1 : a > b ? 1 : 0
    })
    temples.forEach(temple => {
      const tag = getTempleTag(temple)
      const $row = $('<div class="row">: </div>').appendTo($temples)
      const place = /([^?@-]+)/.exec(templeMap[temple])[1] + (tag ? ` (${tag})` : '')
      const $head = $(`<span class="t-head" title="${place}">${temple}</span>`).prependTo($row)

      $head.click(function () {
          hi(temple)
          circleEnter(this, $('#map').position().top, $('#map').position().left + 10)
          return setInput(temple, 1, false)
        })
      if (tag) {
        $head.append(`<sup title="${tag}">✩</sup>`)
      }
      addMapSpan($row, nodes[temple].coordinate, temple).prependTo($row)

      nodes[temple].names.forEach(name => {
        const node = findNode(name)
        const dynasty = toDynastyRange(node, true)
        const title = [node.group || '', dynasty || ''].join(' ').trim()

        $(`<span class="t-name" title="${title}">${name}</span>`).appendTo($row)
          .click(function () {
            ensureNodeVisible(node.id, true)
            hi(temple)
            circleEnter(this, $('#map').position().top, $('#map').position().left + 10)
            return setInput(name, 1, false)
          })
      })
    })
    $temples.appendTo($content)
  }
}

// 用部分省会的经纬度对准拟合SVG坐标
function adjustMap(op) {
  const d1 = [], d2 = []
  const paths = Array.from(document.querySelectorAll('#map path[lng][lat]'))

  paths.forEach(p => {
    const box = p.getBBox()
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    const lng = parseFloat(p.getAttribute('lng'))
    const lat = parseFloat(p.getAttribute('lat'))

    d1.push({ x: lng, y: x, id: p.getAttribute('id') })
    d2.push({ x: lat, y: y, id: p.getAttribute('id') })
  })
  lngS = linearRegression(d1)
  latS = linearRegression(d2)
  // console.log(d1.map(p => [p.id, p.x * lngS.a + lngS.b - p.y]))
  // console.log(d2.map(p => [p.id, p.x * latS.a + latS.b - p.y]))

  if (op === 'adjust') { // 显示拟合效果
    addCircles({
      temples: paths.map(p => p.getAttribute('id')),
      coordinates: d1.map((a, i) => a.x + ',' + d2[i].x)
    })
  } else if (op === 'city') { // 显示省会地点
    const cities = Object.keys(templeMap).filter(s => s.length === 2)
    addCircles({
      temples: cities,
      coordinates: cities.map(s => /@(.+)$/.exec(templeMap[s])[1])
    })
  } else if (op === 'all') { // 显示所有人的地点圆点、地点对应的各个人名的列表
    showChildren(patriarchs, $('#info'))
  }
}

// 显示地点圆点，返回动态亮显函数
function addCircles(data, extra='', animate=false) {
  const circles = []
  const temples = data.temples.slice()
  draw = draw || SVG($('#map svg')[0])

  if (data.birthplace && !extra) {
    console.assert(data.coordinates[temples.length])
    temples.push('出生地')
  }
  temples.forEach((temple, i) => {
    const birth = temple === '出生地'
    const coordinate = (data.coordinates[i] || '').split(',').map(s => parseFloat(s))
    const n = temple.split(',').length
    const r = n > 1 ? Math.min(1 + n * 0.6, 7) : birth ? 4 : data.name ? 3 : 2

    if (coordinate.length > 1) {
      const c = SVG(`<circle tmp r="${animate ? (birth ? 8 : 15) : r}"
 cx="${Math.round((lngS.a * coordinate[0] + lngS.b) * 100) / 100}"
 cy="${Math.round((latS.a * coordinate[1] + latS.b) * 100) / 100}"
 data-title="${extra ? data.name + ': ' : ''}${temple}"
 ${extra || birth && 'stroke="rgba(0,80,0,.7)" fill="none"' || 'fill="rgba(0,0,80,.7)"'}/>`).addTo(draw)
        .click(() => !birth && setInput(/,/.test(temple) ? temple.split(/[: ]/g)[0] : temple.replace(/^.+:/, '')))

      if (animate) {
        c.animate(500, 300).attr({ r: r })
      }
      circles.push({ c: c, temple: temple })
    }
  })

  return function (text) {
    for (let i = 0; i < circles.length; i++) {
      if (circles[i].temple.indexOf(text) >= 0) {
        circles[i].c.attr({ r: 15 }).animate(500, 300).attr({ r: 3 })
        break
      }
    }
  }
}

// 设置搜索框文本
function setInput(text, maxCount=0, showList=true) {
  search(text, maxCount)
  $('#search-box').val(text)
  if (showList) {
    showSearchList()
  }
  return false // break event
}

function ensureNodeVisible(id, select=false) {
  const instance = $.jstree.reference('#name-tree')
  const node = instance.get_node(id)

  if (!node) {
    return
  }
  const parents = node.parents.slice(0, -1)
  const loop = (i, ended) => i >= 0 ? instance.open_node(parents[i], () => loop(i - 1, ended)) : ended()

  parents.splice(0, 0, id)
  loop(parents.length - 1, () => setTimeout(() => {
    let dom = instance.get_node(id, true)

    dom = dom && dom.find('a')[0]
    if (dom) {
      dom.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
    if (select) {
      instance.deselect_all(true)
      instance.select_node(id, true)
    }
  }, 200))
}

function addMapSpan($row, coordinate, temple) {
  const xy = Array.isArray(coordinate) ? coordinate : (coordinate || '').split(',')
  const url = `https://map.bmcx.com/#y=amap&l=ditu&z=16&lat=${xy[1]}&lng=${xy[0]}`
  const $span = $(`<span class="map">地图</span>`).toggle(xy.length === 2)

  if (xy.length === 2 && !/[?]$/.test(temple)) {
    $span.appendTo($row).click(() => {
      if (isTouch) { // 触控设备上内嵌加载地图
        const place = (templeMap[temple] || '').replace(/\s*[?@-].+$/, '') || temple
        const $p = $(`<div class="right rt-map"/>`).appendTo($('#right').hide().parent())

        $(`<div class="close-map">× ${temple === place ? '' : temple + ':'} ${place}<span>×</span></div>`).appendTo($p)
          .click(() => exitMapMode())
        $('body').addClass('map-mode')
        $(`<iframe src="${url}" width="100%" height="100%" frameborder="0">不支持</iframe>`).appendTo($p)
      } else { // 鼠标设备上另打开地图页面
        window.open(url)
      }
      return false // break event
    })
  }

  return $span
}

function exitMapMode() {
  $('iframe,.close-map,.rt-map').remove()
  $('body').removeClass('map-mode')
  $('#right').show()
}

// 显示指定节点id的内容
function updateContent(id, parents=null, data=null) {
  const $content = $('#info').html('')

  if (isTouch) {
    exitMapMode()
  }
  hideSearchList()
  $('#search-box').val('') // 搜索框清空
  $('#map [tmp]').remove() // 清除地点圆点
  adjustMap(id) // 更新显示比例，可能显示特殊地点

  if (!id || !data || !parents) { // 要显示当前一个人的内容才继续
    return
  }

  // 显示上一级人的地点，本人地点动画显示
  addCircles(findNode(parents[0]) || {temples: []}, 'fill="rgba(30,150,30,.7)"')
  const hi = addCircles(data, null, true)

  const $nameRow = $('<div class="row names"/>').appendTo($content)
  const $templesList = $('<div class="row temples"/>')
  const $parents = parents.length > 1 && $(`<div class="row parents">${data.name.replace(dummyRe, '…')}</div>`)
  const alias = data.alias.slice()
  const isYear = d => d && typeof d === 'number'
  const dynasty = toDynastyRange(data)

  $(`<span class="name">${data.name}</span>`).appendTo($nameRow)
  if (data.group) {
    $(`<span class="group">${data.group}</span>`).prependTo($nameRow)
  }
  if (alias.length) {
    $nameRow.append('(' + alias.join('，') + ')')
  }
  if (dummyRe.test(data.name)) {
    $nameRow.remove()
    const ids = [], scan = s => patriarchs.forEach(p => p.parent.indexOf(s) >= 0 &&
      ids.push(p.id) && scan(findNode(p.id).name))
    scan(findNode(parents[0]).name)
    showChildren(patriarchs.filter(p => ids.indexOf(p.id) >= 0), $content)
  }
  if (isYear(data.born) || isYear(data.dead)) {
    $nameRow.append(' (' +
      (isYear(data.born) ? data.born : '?' + (data.born ? `<small>${data.born}</small>` : '')) + '～' +
      (isYear(data.dead) ? data.dead : '?' + (data.dead ? `<small>${data.dead}</small>` : '')) + ', ' +
      dynasty + ')')
  } else if (dynasty) {
    $nameRow.append(' (' + dynasty + ')')
  }

  if (data.birthplace) {
    const $row = $(`<div class="row temple">出生地: <span class="text">${data.birthplace}</span></div>`)
      .appendTo($templesList).click(() => hi('出生地'))
    if (/[村镇]$/.test(data.birthplace)) {
      addMapSpan($row, data.coordinates[data.temples.length], data.birthplace)
    }
  }
  data.templesFull.forEach((temple, i) => {
    const templeName = data.temples[i]
    const $row = $(`<div class="row temple"><span class="text">${temple.replace(/[?-]$/, '')}</span></div>`)
      .appendTo($templesList).click(() => hi(templeName))
    const sames = patriarchs.filter(p => p.id !== id && p.temples.filter(t => t === templeName).length)

    if (templeName !== temple) {
      const $templeName = $(`<span class="temple-name"><span>${templeName}</span></span>`).prependTo($row)
      if (sames.length) {
        $templeName.append(`<sup title="${sames.map(p => p.name).join('\n')}">${sames.length + 1}</sup>`)
        $templeName.addClass('has-sames').click(() => hi(templeName) || setInput(templeName))
      }
      addMapSpan($row, data.coordinates[i], templeName)
    }
  })
  if ($parents) {
    parents.forEach((pid, i) => {
      if (pid === '#') {
        return $(`<span>全部</span>`).prependTo($parents)
          .click(() => updateContent('all'))
      }
      const prev = findNode(i ? parents[i - 1] : data.id)
      const parent = findNode(pid)
      const parentNote = /(\(.+)$/.exec(prev.parent)
      const $parent = $(`<span>${parent.name.replace(dummyRe, '')}</span>`)

      $parent.prependTo($parents)
        .click(() => !dummyRe.test(parent.name) && clickNode(pid))
      if (/…/.test(prev.parent) || dummyRe.test(parent.name)) {
        $parent.attr('omit', '…')
      } else if (parentNote) {
        $parent.attr('omit', parentNote[0])
      }
      if (parent.head) {
        $parent.attr('title', parent.group).prepend(`<small>${parent.head}</small>`)
      }
    })
  }

  $templesList.appendTo($content)
  if ($parents) {
    $parents.prependTo($content)
  }
}
