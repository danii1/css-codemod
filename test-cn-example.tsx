import React from 'react'
import cn from 'classnames'

interface Props {
    value: { height: number }
    minHeight: number
}

export const TestComponent: React.FC<Props> = ({ value, minHeight }) => {
    const heightClassName = cn('Form_Input', {
        'SizePicker__input--error': value.height < minHeight,
    })

    return (
        <div className={heightClassName}>
            <input className="Form_Field" />
        </div>
    )
}
