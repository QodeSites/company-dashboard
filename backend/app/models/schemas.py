from pydantic import BaseModel, Field
from datetime import date
from typing import Optional

class MasterSheet(BaseModel):
    qcode: str = Field(..., min_length=1)
    date: date
    portfolio_value: Optional[float] = None
    capital_in_out: Optional[float] = None
    nav: Optional[float] = Field(None, ge=0)
    prev_nav: Optional[float] = None
    pnl: Optional[float] = None
    daily_p_l: Optional[float] = None
    exposure_value: Optional[float] = None
    prev_portfolio_value: Optional[float] = None
    prev_exposure_value: Optional[float] = None
    prev_pnl: Optional[float] = None
    drawdown: Optional[float] = None
    system_tag: str = Field(..., min_length=1)