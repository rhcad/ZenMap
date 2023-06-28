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
  return patriarchs.filter(p => p.id === id)[0]
}

// 根据上级名号得到下一级节点
function findNodes(parent, group) {
  return patriarchs.filter(p => p.parent.indexOf(parent) >= 0)
    .map(p => {
      const a_attr = { title: '' }

      p.group = group
      if (p.alias.length) {
        console.assert(Array.isArray(p.alias), p.name + ': invalid alias')
        a_attr.title += p.name + '(' + p.alias.join(', ') + ')\n'
        p.alias.forEach(alia => {
          if (/[宗派系]$/.test(alia)) {
            p.group = alia
            p.alias.splice(p.alias.indexOf(alia), 1)
          }
        })
      }
      if (p.templesFull.length) {
        a_attr.title += p.templesFull.join('\n')
      }
      return {
        id: p.id,
        text: p.name,
        children: findNodes(p.name, p.group),
        data: p,
        a_attr: a_attr
      }
    })
}

let lngS = 0, latS = 0
let draw;
const svgTmp = {}
const svgTooltip = document.getElementById('tooltip')

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
function search(text) {
  let lastScore = 0.8

  $searchResult.html('')
  fuse.search(text).slice(0, 20).forEach(s => {
    if (lastScore > s.score - 0.3) {
      const $r = $('<div class="search-item"/>').data('id', s.item.id)

      if (!s.matches.filter(m => m.key === 'name')[0]) {
        $('<span class="s-name"/>').appendTo($r).text(s.item.name)
      }
      s.matches.forEach(m => {
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
  return false
}

function showSearchList() {
  clearTimeout(searchResult.timer)
  searchResult.timer = setTimeout(() => $searchResult.show(), 50)
}

function hideSearchList(force) {
  setTimeout(function () {
    if ($searchResult.is(':visible')) {
      clearTimeout(searchResult.timer)
      searchResult.timer = setTimeout(() => $searchResult.hide(), force === true ? 0 : 100)
    }
  }, 50)
  onCircleLeave()
}


// 地点圆点的鼠标滑入消息响应
function onCircleEnter(e) {
  setTimeout(() => {
    clearTimeout(svgTmp.tmTip)
    svgTooltip.innerText = this.getAttribute('data-title')
    svgTooltip.style.top = `${e.pageY - 50}px`
    svgTooltip.style.left = `${e.pageX - 50}px`
    svgTooltip.removeAttribute('hidden')
  }, 20)
  e.preventDefault()
  e.stopImmediatePropagation()
}

// 地点圆点的鼠标滑出消息响应
function onCircleLeave() {
  clearTimeout(svgTmp.tmTip)
  svgTmp.tmTip = setTimeout(() => svgTooltip.toggleAttribute('hidden', true), 200)
}

function showChildren(people, $content) {
  const nodes = {}

  people.forEach(p => {
    p.temples.forEach((temple, i) => {
      if (p.coordinates[i]) {
        nodes[temple] = nodes[temple] || {names: [], coordinate: p.coordinates[i]}
        nodes[temple].names.push(p.name)
      }
    })
  })
  addCircles({
    temples: Object.keys(nodes).map(s => {
      const n = nodes[s].names.length
      return `${s}${n > 1 ? ' ' + n : ''}: ` + nodes[s].names.join(', ')
    }),
    coordinates: Object.keys(nodes).map(s => nodes[s].coordinate)
  })
  if ($content) {
    const $temples = $('<div class="row temples"/>').appendTo($content)
    const temples = Object.keys(nodes)

    temples.sort((a, b) => templeMap[a] < templeMap[b] ? -1 : templeMap[a] > templeMap[b] ? 1 : 0)
    temples.forEach(temple => {
      const $row = $('<div class="row">: </div>').appendTo($temples)
      $(`<span class="t-head">${temple}</span>`).prependTo($row).click(() => setInput(temple))
      nodes[temple].names.forEach(name => {
        $(`<span class="t-name">${name}</span>`).appendTo($row).click(() => setInput(name))
      })
    })
  }
}

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

  if (op === 'adjust') {
    addCircles({
      temples: paths.map(p => p.getAttribute('id')),
      coordinates: d1.map((a, i) => a.x + ',' + d2[i].x)
    })
  } else if (op === 'city') {
    const cities = Object.keys(templeMap).filter(s => s.length === 2)
    addCircles({
      temples: cities,
      coordinates: cities.map(s => /@(.+)$/.exec(templeMap[s])[1])
    })
  } else if (op === 'all') {
    showChildren(patriarchs, $('#info'));
  }
}

function addCircles(data, extra='', animate=false) {
  draw = draw || SVG($('#map svg')[0])
  data.temples.forEach((temple, i) => {
    const coordinate = (data.coordinates[i] || '').split(',').map(s => parseFloat(s))
    const r = data.name ? 3 : 2

    if (coordinate.length > 1) {
      const c = SVG(`<circle tmp r="${animate ? 6 : r}"
 cx="${Math.round((lngS.a * coordinate[0] + lngS.b) * 100) / 100}"
 cy="${Math.round((latS.a * coordinate[1] + latS.b) * 100) / 100}"
 data-title="${extra ? data.name + ': ' : ''}${temple}"
 ${extra || 'fill="rgba(0,0,0,.7)"'}/>`).addTo(draw)
        .click(() => setInput(/,/.test(temple) ? temple.split(/[: ]/g)[0] : temple.replace(/^.+:/, '')))

      if (animate) {
        c.animate(300, 200).attr({ r: r })
      }
    }
  })
}

function setInput(text) {
  search(text)
  $('#search-box').val(text)
  showSearchList()
}

function updateContent(id, parents, data) {
  const $content = $('#info').html('')

  if (isTouch) {
    $('iframe').remove()
    $('#right').show()
  }
  $('#search-box').val('')
  $('#map [tmp]').remove()
  adjustMap(id)
  if (!id || !data || !parents) {
    return
  }

  addCircles(findNode(parents[0]) || {temples: []}, 'fill="rgba(30,150,30,.7)"')
  addCircles(data, null, true)

  const $nameRow = $('<div class="row names"/>').appendTo($content)
  const $templesList = $('<div class="row temples"/>').appendTo($content)
  const alias = data.alias.slice()
  const isYear = d => d && typeof d === 'number'
  const dummy = /^.+未知$/

  $(`<span class="name">${data.name}</span>`).appendTo($nameRow)
  if (data.group) {
    $(`<span class="group">${data.group}</span>`).prependTo($nameRow)
  }
  if (alias.length) {
    $nameRow.append('(' + alias.join('，') + ')')
  }
  if (dummy.test(data.name)) {
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
      toDynasty(data.born, 20) + '～' + toDynasty(data.dead, -5) + ')')
  }
  data.templesFull.forEach((temple, i) => {
    const templeName = data.temples[i]
    const $temple = $(`<div class="row temple">${temple.replace(/[?-]$/, '')}</div>`).appendTo($templesList)
    const sames = patriarchs.filter(p => p.id !== id && p.temples.filter(t => t === templeName).length)
    const xy = (data.coordinates[i] || '').split(',')

    if (templeName !== temple) {
      const $templeName = $(`<span class="temple-name">${templeName}</span>`).prependTo($temple)
      if (sames.length) {
        $templeName.append(`<sup title="${sames.map(p => p.name).join('\n')}">${sames.length + 1}</sup>`)
        $templeName.addClass('has-sames').click(() => setInput(templeName))
      }
      if (xy.length === 2 && !/[?-]$/.test(temple)) {
        const url = `https://map.bmcx.com/#y=amap&l=ditu&z=16&lat=${xy[1]}&lng=${xy[0]}`
        $(`<span class="map">🌐</span>`).appendTo($temple)
          .click(() => {
            if (isTouch) {
              $('#right').hide().parent()
                .append(`<iframe src="${url}" class="right" width="100%" height="100%" frameborder="0"></iframe>`)
            } else {
              window.open(url)
            }
          })
      }
    }
  })
  if (parents.length > 1) {
    const $parents = $(`<div class="row parents">${data.name.replace(dummy, '…')}</div>`).prependTo($content)
    parents.slice(0, -1).forEach(pid => {
      const data = findNode(pid)
      $(`<span>${data.name.replace(dummy, '…')}</span>`).prependTo($parents)
        .click(() => !dummy.test(data.name) && clickNode(pid))
    })
  }
}
