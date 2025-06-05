import React from 'react'

interface PmsAccount {
    qcode: string;
}
const PmsAccount = ({ qcode }:PmsAccount) => {
  return (
    <div>{qcode}</div>
  )
}

export default PmsAccount