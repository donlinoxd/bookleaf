import React from 'react'
import Svg, { Circle, Text as SvgText } from 'react-native-svg'

interface Props {
    ratio: number
    color?: string
    trackColor?: string
    size?: number
    strokeWidth?: number
    label?: string
    sublabel?: string
}

export function DonutRing({
    ratio,
    color = '#5CB85C',
    trackColor = '#E2EFE0',
    size = 96,
    strokeWidth = 12,
    label,
    sublabel,
}: Props) {
    const r = (size - strokeWidth) / 2
    const cx = size / 2
    const cy = size / 2
    const circ = 2 * Math.PI * r
    const safe = Math.min(Math.max(ratio, 0), 1)
    const offset = circ * (1 - safe)

    return (
        <Svg width={size} height={size}>
            <Circle cx={cx} cy={cy} r={r} fill='none' stroke={trackColor} strokeWidth={strokeWidth} />
            {safe > 0 && (
                <Circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill='none'
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${circ} ${circ}`}
                    strokeDashoffset={offset}
                    strokeLinecap='round'
                    transform={`rotate(-90, ${cx}, ${cy})`}
                />
            )}
            {label ? (
                <SvgText
                    x={cx}
                    y={cy + (sublabel ? 4 : 6)}
                    textAnchor='middle'
                    fontSize={sublabel ? 14 : 16}
                    fontWeight='bold'
                    fill='#1C2B1E'
                >
                    {label}
                </SvgText>
            ) : null}
            {sublabel ? (
                <SvgText x={cx} y={cy + 18} textAnchor='middle' fontSize={8} fill='#7A9A7E'>
                    {sublabel}
                </SvgText>
            ) : null}
        </Svg>
    )
}
