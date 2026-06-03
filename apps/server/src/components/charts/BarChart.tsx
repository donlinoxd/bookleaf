import React from 'react'
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg'

export interface BarItem {
    label: string
    primary: number
    secondary?: number
}

interface Props {
    data: BarItem[]
    width: number
    height?: number
    primaryColor?: string
    secondaryColor?: string
}

export function BarChart({ data, width, height = 130, primaryColor = '#2A5C33', secondaryColor = '#A8D5A2' }: Props) {
    if (!data.length) return null

    const LABEL_H = 18
    const PLOT_H = height - LABEL_H
    const hasTwo = data.some((d) => d.secondary !== undefined)
    const maxVal = Math.max(...data.flatMap((d) => [d.primary, d.secondary ?? 0]), 1)
    const gW = width / data.length
    const pad = Math.max(gW * 0.1, 2)
    const bW = hasTwo ? (gW - pad * 3) / 2 : gW - pad * 2

    return (
        <Svg width={width} height={height}>
            {data.map((d, i) => {
                const gx = i * gW
                const h1 = PLOT_H * (d.primary / maxVal)
                const h1c = Math.max(h1, d.primary > 0 ? 3 : 0)
                const x1 = gx + pad

                const h2 = d.secondary !== undefined ? PLOT_H * (d.secondary / maxVal) : 0
                const h2c = d.secondary !== undefined ? Math.max(h2, d.secondary > 0 ? 3 : 0) : 0
                const x2 = x1 + bW + pad

                const shortLabel = d.label.split(' ')[0]

                return (
                    <G key={i}>
                        <Rect x={x1} y={PLOT_H - h1c} width={bW} height={h1c} rx={3} fill={primaryColor} />
                        {hasTwo && d.secondary !== undefined && (
                            <Rect x={x2} y={PLOT_H - h2c} width={bW} height={h2c} rx={3} fill={secondaryColor} />
                        )}
                        <SvgText x={gx + gW / 2} y={height - 3} textAnchor='middle' fontSize={9} fill='#7A9A7E'>
                            {shortLabel}
                        </SvgText>
                    </G>
                )
            })}
        </Svg>
    )
}
